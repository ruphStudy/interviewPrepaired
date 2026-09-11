import { EmailDelivery } from '../models/EmailDelivery.model';
import { transactionalEmailService } from './TransactionalEmailService';

const BATCH_SIZE = 20;

/**
 * Minimal persistent retry/outbox worker for EmailDelivery (PR-COMM-6).
 * No queue/job infrastructure exists elsewhere in this codebase to reuse,
 * so this is a small, self-contained, DB-backed poller — compatible with a
 * future migration to a real job runner (it only ever touches
 * EmailDelivery's own status/nextAttemptAt fields).
 *
 * Concurrency safety: `claimNext` is a single atomic `findOneAndUpdate`
 * transitioning `queued -> sending`, filtered by `nextAttemptAt`. Even with
 * multiple app instances/processes calling `runOnce()` concurrently, only
 * one instance ever wins the claim for a given delivery row — Mongo
 * guarantees single-document update atomicity. No in-memory/process lock
 * is used or relied upon.
 */
class EmailRetryService {
  private running = false;

  /** Call on an interval (see server.ts) — safe to call again while a previous run is still in flight (it just no-ops). */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < BATCH_SIZE; i++) {
        const claimed = await this.claimNext();
        if (!claimed) break;

        try {
          await transactionalEmailService.attemptSend(claimed);
        } catch (error) {
          // Defensive — attemptSend already catches provider errors
          // internally, so this only fires on a genuine bug. Never leave
          // the row stuck in 'sending'.
          console.error('[EmailRetryService] Unexpected error while attempting a queued send — requeuing', {
            deliveryId: claimed._id.toString(),
            error,
          });
          await EmailDelivery.updateOne(
            { _id: claimed._id, status: 'sending' },
            { $set: { status: 'queued', nextAttemptAt: new Date(Date.now() + 60 * 1000) } }
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async claimNext() {
    const now = new Date();
    return EmailDelivery.findOneAndUpdate(
      {
        status: 'queued',
        $or: [{ nextAttemptAt: { $lte: now } }, { nextAttemptAt: { $exists: false } }],
      },
      { $set: { status: 'sending' } },
      { new: true, sort: { nextAttemptAt: 1 } }
    ).select('+pendingContent');
  }
}

export const emailRetryService = new EmailRetryService();
