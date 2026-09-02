import { SubscriptionPlan, ISubscriptionPlan } from '../models/SubscriptionPlan.model';
import { DEFAULT_B2C_PLANS } from '../constants/subscription';

class SubscriptionPlanService {
  async getActivePlans(): Promise<ISubscriptionPlan[]> {
    return SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 });
  }

  async getPlanByCode(code: string): Promise<ISubscriptionPlan | null> {
    return SubscriptionPlan.findOne({ code: code.toUpperCase() });
  }

  async getDefaultPlan(): Promise<ISubscriptionPlan | null> {
    return SubscriptionPlan.findOne({ isDefault: true, isActive: true });
  }

  /**
   * Idempotently ensures the four default B2C plans exist. Uses
   * $setOnInsert so an existing plan document (including one an admin has
   * since customized) is never modified or overwritten — only missing plans
   * are created, and no plan is ever deleted.
   */
  async ensureDefaultPlans(): Promise<void> {
    for (const plan of DEFAULT_B2C_PLANS) {
      await SubscriptionPlan.updateOne(
        { code: plan.code },
        {
          $setOnInsert: {
            code: plan.code,
            name: plan.name,
            description: plan.description,
            type: 'b2c',
            priceInrPaise: plan.priceInrPaise,
            billingInterval: plan.billingInterval,
            includedInterviews: plan.includedInterviews,
            isActive: true,
            isDefault: plan.isDefault,
            sortOrder: plan.sortOrder,
            features: plan.features,
          },
        },
        { upsert: true }
      );
    }
  }
}

export const subscriptionPlanService = new SubscriptionPlanService();
