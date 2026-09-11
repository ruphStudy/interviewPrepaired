import { CreditPack, ICreditPack } from '../models/CreditPack.model';
import { DEFAULT_CREDIT_PACKS } from '../constants/billing';

/** Mirrors SubscriptionPlanService's conventions exactly for the B2C credit-pack catalog (PR-BILL-5). */
class CreditPackService {
  async getActivePacks(): Promise<ICreditPack[]> {
    return CreditPack.find({ active: true }).sort({ sortOrder: 1 });
  }

  async getPackByCode(code: string): Promise<ICreditPack | null> {
    return CreditPack.findOne({ code: code.toUpperCase() });
  }

  /**
   * Idempotently ensures the default credit packs exist. Uses $setOnInsert
   * so an existing pack (including one an admin has since customized) is
   * never modified or overwritten — only missing packs are created.
   */
  async ensureDefaultPacks(): Promise<void> {
    for (const pack of DEFAULT_CREDIT_PACKS) {
      await CreditPack.updateOne(
        { code: pack.code },
        {
          $setOnInsert: {
            code: pack.code,
            name: pack.name,
            description: pack.description,
            credits: pack.credits,
            priceInrPaise: pack.priceInrPaise,
            active: true,
            sortOrder: pack.sortOrder,
          },
        },
        { upsert: true }
      );
    }
  }
}

export const creditPackService = new CreditPackService();
