import Organization from '../models/Organization.model';
import { OrganizationType } from '../constants/organization';
import { organizationSubscriptionService } from './OrganizationSubscriptionService';
import { getCompanyPlan, OrganizationBillingPlanDefinition } from '../constants/organizationBillingPlan';
import { ApiError } from '../utils/ApiError';

export interface OrganizationEntitlements {
  billingType: 'institute_prepaid' | 'company_subscription' | 'unknown';
  subscriptionStatus?: string;
  planCode?: string;
  features: string[];
  limits: {
    candidateLimit?: number | null;
    jobLimit?: number | null;
    memberLimit?: number | null;
  };
  /** true when there is no OrganizationSubscription row at all — every pre-existing organization is treated as legacy/grandfathered (full access), never suddenly gated. */
  legacyGrandfathered: boolean;
}

/**
 * Resolves what an organization is currently entitled to (PR-B2B-BILL-3).
 * CRITICAL invariant: an organization with NO OrganizationSubscription row
 * at all (i.e. every organization that existed before this PR) is legacy/
 * grandfathered — `hasFeature`/`assertFeature` must never 403 it. This
 * service is deliberately NOT wired into any existing employer controller's
 * request path in this PR; it exists for the new billing status
 * endpoints only.
 */
class OrganizationEntitlementService {
  async getEntitlements(organizationId: string): Promise<OrganizationEntitlements> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }

    if (organization.type === OrganizationType.INSTITUTE) {
      return {
        billingType: 'institute_prepaid',
        features: [],
        limits: {},
        legacyGrandfathered: true,
      };
    }

    const subscription = await organizationSubscriptionService.getCurrentSubscription(organizationId);
    if (!subscription) {
      // No subscription row at all — legacy/grandfathered, full access.
      return {
        billingType: 'company_subscription',
        features: [],
        limits: {},
        legacyGrandfathered: true,
      };
    }

    const plan: OrganizationBillingPlanDefinition | undefined = getCompanyPlan(subscription.planCode);
    return {
      billingType: 'company_subscription',
      subscriptionStatus: subscription.status,
      planCode: subscription.planCode,
      features: plan?.features ?? [],
      limits: {
        candidateLimit: plan?.candidateLimit,
        jobLimit: plan?.jobLimit,
        memberLimit: plan?.memberLimit,
      },
      legacyGrandfathered: false,
    };
  }

  /** true if the organization is legacy/grandfathered OR its resolved plan lists this feature. */
  async hasFeature(organizationId: string, feature: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(organizationId);
    if (entitlements.legacyGrandfathered) {
      return true;
    }
    return entitlements.features.includes(feature);
  }

  /** Throws only when there IS a resolved subscription/plan concept AND that plan does not list the feature. Never throws for a legacy/grandfathered organization. */
  async assertFeature(organizationId: string, feature: string): Promise<void> {
    const allowed = await this.hasFeature(organizationId, feature);
    if (!allowed) {
      throw new ApiError(403, `This organization's current plan does not include "${feature}"`);
    }
  }

  async getLimits(organizationId: string): Promise<OrganizationEntitlements['limits']> {
    const entitlements = await this.getEntitlements(organizationId);
    return entitlements.limits;
  }
}

export const organizationEntitlementService = new OrganizationEntitlementService();
