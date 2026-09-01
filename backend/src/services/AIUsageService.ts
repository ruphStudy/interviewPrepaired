import { Types } from 'mongoose';
import Interview, { IAIUsage } from '../models/interview.model';
import { getModelPricing } from '../config/openaiPricing';

export interface RecordUsageParams {
  interviewId: string;
  operation: string;
  model: string;
  questionIndex?: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8; // 8dp — keeps small per-call costs from truncating to 0
}

const DEFAULT_USD_TO_INR = 95;

/** Single source for the USD->INR rate — never hardcode this elsewhere. Display-only, not a live/exact FX rate. */
function getUsdToInrRate(): number {
  const configured = Number(process.env.USD_TO_INR);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_USD_TO_INR;
}

function toInr(usd: number): number {
  return round(usd * getUsdToInrRate());
}

/**
 * Persists one real, already-completed OpenAI call's actual usage against its
 * interview. Never called speculatively — only after a successful response.
 * Awaited by the caller (OpenAIService.callOpenAI) before it returns, so a
 * final-report-generation call's cost is durably recorded before the report
 * response is built.
 */
export async function recordAIUsage(params: RecordUsageParams): Promise<void> {
  const { interviewId, operation, model, questionIndex, promptTokens, cachedTokens, completionTokens, totalTokens } = params;

  const pricing = getModelPricing(model);
  const nonCachedInputTokens = Math.max(promptTokens - cachedTokens, 0);

  let inputCostUsd = 0;
  let cachedInputCostUsd = 0;
  let outputCostUsd = 0;
  let pricingStatus: 'calculated' | 'unknown' = 'unknown';

  if (pricing) {
    inputCostUsd = round((nonCachedInputTokens / 1_000_000) * pricing.inputPerMillionUsd);
    cachedInputCostUsd = pricing.cachedInputPerMillionUsd
      ? round((cachedTokens / 1_000_000) * pricing.cachedInputPerMillionUsd)
      : 0;
    outputCostUsd = round((completionTokens / 1_000_000) * pricing.outputPerMillionUsd);
    pricingStatus = 'calculated';
  }

  const totalCostUsd = pricingStatus === 'calculated' ? round(inputCostUsd + cachedInputCostUsd + outputCostUsd) : 0;

  console.log('[AIUsage]', {
    interviewId,
    operation,
    model,
    inputTokens: promptTokens,
    cachedInputTokens: cachedTokens,
    outputTokens: completionTokens,
    totalTokens,
    costUsd: pricingStatus === 'calculated' ? totalCostUsd : null,
  });

  const callRecord: Record<string, unknown> = {
    operation,
    model,
    inputTokens: promptTokens,
    cachedInputTokens: cachedTokens,
    outputTokens: completionTokens,
    totalTokens,
    inputCostUsd,
    cachedInputCostUsd,
    outputCostUsd,
    totalCostUsd,
    pricingStatus,
    timestamp: new Date(),
  };
  if (questionIndex !== undefined) callRecord.questionIndex = questionIndex;

  try {
    await Interview.updateOne(
      { _id: new Types.ObjectId(interviewId) },
      {
        $push: { 'aiUsage.calls': callRecord },
        $inc: {
          'aiUsage.totals.inputTokens': promptTokens,
          'aiUsage.totals.cachedInputTokens': cachedTokens,
          'aiUsage.totals.outputTokens': completionTokens,
          'aiUsage.totals.totalTokens': totalTokens,
          'aiUsage.totals.inputCostUsd': inputCostUsd,
          'aiUsage.totals.cachedInputCostUsd': cachedInputCostUsd,
          'aiUsage.totals.outputCostUsd': outputCostUsd,
          'aiUsage.totals.totalCostUsd': totalCostUsd,
          'aiUsage.totals.callCount': 1,
          'aiUsage.totals.pricingCompleteCallCount': pricingStatus === 'calculated' ? 1 : 0,
        },
      }
    );
  } catch (err) {
    // Never let cost bookkeeping fail the underlying AI request/response.
    console.error('[AIUsage] Failed to persist usage (non-critical):', err);
  }
}

export interface AICostBreakdownEntry {
  operation: string;
  callCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  costInr: number;
}

export interface AICostReport {
  tracked: boolean;
  currency: 'USD';
  totalCostUsd: number;
  totalCostInr: number;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  callCount: number;
  pricingComplete: boolean;
  breakdown: AICostBreakdownEntry[];
}

const OPERATION_LABELS: Record<string, string> = {
  'question-generation': 'Question Generation',
  'answer-evaluation': 'Answer Evaluation',
  'model-answer-generation': 'Expected Answer Generation',
  'final-report-generation': 'Final Report Generation',
  'star-analysis': 'STAR Analysis',
  'memory-extraction': 'Memory Extraction',
  'claim-verification': 'Claim Verification',
  'contradiction-detection': 'Contradiction Detection',
  'coverage-tracking': 'Competency Coverage Tracking',
};

function getOperationLabel(operation: string): string {
  return OPERATION_LABELS[operation] || operation;
}

/** Returns null (never a fabricated zero-cost object) when the interview predates AI usage tracking. */
export function buildAICostReport(aiUsage: IAIUsage | undefined): AICostReport | null {
  if (!aiUsage || !aiUsage.calls || aiUsage.calls.length === 0) return null;

  const byOperation = new Map<string, AICostBreakdownEntry>();
  for (const call of aiUsage.calls) {
    const existing = byOperation.get(call.operation) || {
      operation: getOperationLabel(call.operation),
      callCount: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      costInr: 0,
    };
    existing.callCount += 1;
    existing.inputTokens += call.inputTokens;
    existing.cachedInputTokens += call.cachedInputTokens;
    existing.outputTokens += call.outputTokens;
    existing.costUsd = round(existing.costUsd + call.totalCostUsd);
    byOperation.set(call.operation, existing);
  }
  // INR is derived once per entry here (report-build time), not persisted —
  // the stored/authoritative amount stays USD.
  for (const entry of byOperation.values()) {
    entry.costInr = toInr(entry.costUsd);
  }

  const totals = aiUsage.totals;
  return {
    tracked: true,
    currency: 'USD',
    totalCostUsd: totals.totalCostUsd,
    totalCostInr: toInr(totals.totalCostUsd),
    totalTokens: totals.totalTokens,
    inputTokens: totals.inputTokens,
    cachedInputTokens: totals.cachedInputTokens,
    outputTokens: totals.outputTokens,
    callCount: totals.callCount,
    pricingComplete: totals.callCount > 0 && totals.pricingCompleteCallCount === totals.callCount,
    breakdown: Array.from(byOperation.values()),
  };
}

// ============================================================================
// Admin aggregation — reads across one interview / one user / all interviews.
// Distinct from buildAICostReport above (which shapes the per-interview
// report UI already ships): these return the admin-endpoint field names.
// ============================================================================

export interface AdminUsageBreakdownEntry {
  key: string;
  callCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costInr: number;
}

function emptyBreakdownEntry(key: string): AdminUsageBreakdownEntry {
  return { key, callCount: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, costInr: 0 };
}

/** interviewId not found -> null (caller returns 404); no aiUsage on the doc -> zeroed report, not an error. */
export async function getInterviewUsage(interviewId: string): Promise<{
  interviewId: string;
  userId: string | null;
  totalInputTokens: number;
  cachedInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  callCount: number;
  totalEstimatedCostUsd: number;
  totalEstimatedCostInr: number;
  pricingComplete: boolean;
  breakdownByOperation: AdminUsageBreakdownEntry[];
  breakdownByModel: AdminUsageBreakdownEntry[];
} | null> {
  if (!Types.ObjectId.isValid(interviewId)) return null;

  const doc = await Interview.findById(interviewId).select('userId aiUsage').lean();
  if (!doc) return null;

  const calls = doc.aiUsage?.calls || [];
  const totals = doc.aiUsage?.totals;

  const byOperation = new Map<string, AdminUsageBreakdownEntry>();
  const byModel = new Map<string, AdminUsageBreakdownEntry>();
  for (const call of calls) {
    for (const [map, key] of [
      [byOperation, call.operation],
      [byModel, call.model],
    ] as const) {
      const entry = map.get(key) || emptyBreakdownEntry(key);
      entry.callCount += 1;
      entry.inputTokens += call.inputTokens;
      entry.cachedInputTokens += call.cachedInputTokens;
      entry.outputTokens += call.outputTokens;
      entry.totalTokens += call.totalTokens;
      entry.costUsd = round(entry.costUsd + call.totalCostUsd);
      map.set(key, entry);
    }
  }
  for (const entry of [...byOperation.values(), ...byModel.values()]) {
    entry.costInr = toInr(entry.costUsd);
  }

  const totalCostUsd = totals?.totalCostUsd || 0;
  const callCount = totals?.callCount || 0;

  return {
    interviewId,
    userId: doc.userId ? doc.userId.toString() : null,
    totalInputTokens: totals?.inputTokens || 0,
    cachedInputTokens: totals?.cachedInputTokens || 0,
    totalOutputTokens: totals?.outputTokens || 0,
    totalTokens: totals?.totalTokens || 0,
    callCount,
    totalEstimatedCostUsd: totalCostUsd,
    totalEstimatedCostInr: toInr(totalCostUsd),
    pricingComplete: callCount > 0 && totals?.pricingCompleteCallCount === callCount,
    breakdownByOperation: Array.from(byOperation.values()),
    breakdownByModel: Array.from(byModel.values()),
  };
}

export interface UsageDateRange {
  from?: Date;
  to?: Date;
}

interface AggregatedUsage {
  interviewCount: number;
  userCount: number;
  callCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  estimatedCostInr: number;
  breakdownByOperation: AdminUsageBreakdownEntry[];
  breakdownByModel: AdminUsageBreakdownEntry[];
}

/** Shared aggregation core for getUserUsage/getGlobalUsage — only the leading $match differs. */
async function aggregateUsage(matchStage: Record<string, unknown>, range?: UsageDateRange): Promise<AggregatedUsage> {
  const callTimestampMatch: Record<string, unknown> = {};
  if (range?.from) callTimestampMatch.$gte = range.from;
  if (range?.to) callTimestampMatch.$lte = range.to;

  // Mongoose's PipelineStage union type doesn't accommodate a dynamically-built
  // pipeline array well; `any` here is scoped to this one aggregation call.
  const pipeline: any[] = [
    { $match: matchStage },
    { $unwind: '$aiUsage.calls' },
  ];
  if (range?.from || range?.to) {
    pipeline.push({ $match: { 'aiUsage.calls.timestamp': callTimestampMatch } });
  }
  pipeline.push({
    $facet: {
      totals: [
        {
          $group: {
            _id: null,
            interviewIds: { $addToSet: '$_id' },
            userIds: { $addToSet: '$userId' },
            callCount: { $sum: 1 },
            inputTokens: { $sum: '$aiUsage.calls.inputTokens' },
            cachedInputTokens: { $sum: '$aiUsage.calls.cachedInputTokens' },
            outputTokens: { $sum: '$aiUsage.calls.outputTokens' },
            totalTokens: { $sum: '$aiUsage.calls.totalTokens' },
            costUsd: { $sum: '$aiUsage.calls.totalCostUsd' },
          },
        },
      ],
      byOperation: [
        {
          $group: {
            _id: '$aiUsage.calls.operation',
            callCount: { $sum: 1 },
            inputTokens: { $sum: '$aiUsage.calls.inputTokens' },
            cachedInputTokens: { $sum: '$aiUsage.calls.cachedInputTokens' },
            outputTokens: { $sum: '$aiUsage.calls.outputTokens' },
            totalTokens: { $sum: '$aiUsage.calls.totalTokens' },
            costUsd: { $sum: '$aiUsage.calls.totalCostUsd' },
          },
        },
      ],
      byModel: [
        {
          $group: {
            _id: '$aiUsage.calls.model',
            callCount: { $sum: 1 },
            inputTokens: { $sum: '$aiUsage.calls.inputTokens' },
            cachedInputTokens: { $sum: '$aiUsage.calls.cachedInputTokens' },
            outputTokens: { $sum: '$aiUsage.calls.outputTokens' },
            totalTokens: { $sum: '$aiUsage.calls.totalTokens' },
            costUsd: { $sum: '$aiUsage.calls.totalCostUsd' },
          },
        },
      ],
    },
  });

  const [result] = await Interview.aggregate(pipeline);
  const totalsRow = result?.totals?.[0];

  const toBreakdown = (rows: any[]): AdminUsageBreakdownEntry[] =>
    (rows || []).map((r) => ({
      key: r._id ?? 'unknown',
      callCount: r.callCount,
      inputTokens: r.inputTokens,
      cachedInputTokens: r.cachedInputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.totalTokens,
      costUsd: round(r.costUsd),
      costInr: toInr(r.costUsd),
    }));

  const costUsd = totalsRow ? round(totalsRow.costUsd) : 0;

  return {
    interviewCount: totalsRow?.interviewIds?.length || 0,
    userCount: totalsRow?.userIds?.length || 0,
    callCount: totalsRow?.callCount || 0,
    inputTokens: totalsRow?.inputTokens || 0,
    cachedInputTokens: totalsRow?.cachedInputTokens || 0,
    outputTokens: totalsRow?.outputTokens || 0,
    totalTokens: totalsRow?.totalTokens || 0,
    estimatedCostUsd: costUsd,
    estimatedCostInr: toInr(costUsd),
    breakdownByOperation: toBreakdown(result?.byOperation),
    breakdownByModel: toBreakdown(result?.byModel),
  };
}

export async function getUserUsage(userId: string, range?: UsageDateRange) {
  if (!Types.ObjectId.isValid(userId)) return null;
  const usage = await aggregateUsage({ userId: new Types.ObjectId(userId) }, range);
  const { userCount: _userCount, ...rest } = usage; // userId is already known — omit the redundant distinct-user count
  return { userId, ...rest };
}

export async function getGlobalUsage(range?: UsageDateRange): Promise<AggregatedUsage> {
  return aggregateUsage({}, range);
}
