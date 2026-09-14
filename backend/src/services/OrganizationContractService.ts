import crypto from 'crypto';
import { Types } from 'mongoose';
import {
  OrganizationContract,
  IOrganizationContract,
  OrganizationContractBillingModel,
} from '../models/OrganizationContract.model';
import { OrganizationManualPayment, IOrganizationManualPayment, OrganizationManualPaymentMethod } from '../models/OrganizationManualPayment.model';
import { organizationInterviewCreditService } from './OrganizationInterviewCreditService';
import { organizationSubscriptionService } from './OrganizationSubscriptionService';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';

interface CreateContractInput {
  organizationId: string;
  startDate: Date;
  endDate?: Date;
  billingModel: OrganizationContractBillingModel;
  planCode?: string;
  contractValueInrPaise?: number;
  creditAllowance?: number;
  renewalTerms?: string;
  externalReference?: string;
  createdByAdminUserId: string;
}

interface RecordManualPaymentInput {
  organizationId: string;
  method: OrganizationManualPaymentMethod;
  amountPaise: number;
  referenceNote?: string;
  paymentDate: Date;
  recordedByAdminUserId: string;
  contractId?: string;
  notes?: string;
}

function generateContractCode(): string {
  return `CONTRACT-${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Global-admin-only enterprise contract lifecycle (PR-B2B-BILL-5). A
 * contract is never a self-service purchase — it exists entirely outside
 * the checkout/verify/webhook path, and its own credit grant / subscription
 * activation reuses the exact same underlying primitives
 * (organizationInterviewCreditService.grantCredits,
 * organizationSubscriptionService.activateFromContract) so there is still
 * only ONE way credits/subscriptions ever get created — never a duplicated
 * mechanism. Contracts/manual-payments are never hard-deleted, only
 * status-flipped, preserving financial history permanently.
 */
class OrganizationContractService {
  async createContract(input: CreateContractInput): Promise<IOrganizationContract> {
    if (input.endDate && input.endDate <= input.startDate) {
      throw new ApiError(400, 'endDate must be after startDate');
    }

    let contractCode = generateContractCode();
    // Vanishingly unlikely collision — retry with a fresh code rather than fail.
    for (let attempt = 0; attempt < 3; attempt++) {
      const exists = await OrganizationContract.findOne({ contractCode });
      if (!exists) break;
      contractCode = generateContractCode();
    }

    return OrganizationContract.create({
      organizationId: input.organizationId,
      contractCode,
      status: 'draft',
      startDate: input.startDate,
      endDate: input.endDate,
      billingModel: input.billingModel,
      planCode: input.planCode,
      contractValueInrPaise: input.contractValueInrPaise,
      creditAllowance: input.creditAllowance,
      renewalTerms: input.renewalTerms,
      externalReference: input.externalReference,
      createdByAdminUserId: input.createdByAdminUserId,
    });
  }

  async listContracts(organizationId: string, options: { page?: number; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const [contracts, total] = await Promise.all([
      OrganizationContract.find({ organizationId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OrganizationContract.countDocuments({ organizationId }),
    ]);
    return { contracts, page, limit, total };
  }

  async getContract(organizationId: string, contractId: string): Promise<IOrganizationContract> {
    const contract = await OrganizationContract.findOne({ _id: contractId, organizationId });
    if (!contract) {
      throw new ApiError(404, 'Contract not found');
    }
    return contract;
  }

  /** The organization's current active contract, if any — read-only, used by billing status/UI endpoints. */
  async getActiveContract(organizationId: string): Promise<IOrganizationContract | null> {
    return OrganizationContract.findOne({ organizationId, status: 'active' }).sort({ createdAt: -1 });
  }

  /**
   * Only draft -> active is allowed. Idempotent by contract id: a duplicate
   * activate call on an already-active contract throws
   * CONTRACT_ALREADY_ACTIVE and never double-grants credits/subscription —
   * the credit grant itself also carries its own idempotencyKey (defense in
   * depth), but the draft->active guard is what actually prevents a second
   * call from running the grant logic at all.
   */
  async activateContract(organizationId: string, contractId: string): Promise<IOrganizationContract> {
    const contract = await this.getContract(organizationId, contractId);

    if (contract.status === 'active') {
      throw new ApiError(409, 'This contract is already active', undefined, BillingErrorCode.CONTRACT_ALREADY_ACTIVE);
    }
    if (contract.status !== 'draft') {
      throw new ApiError(409, `Only a draft contract can be activated (current status: ${contract.status})`);
    }

    // Atomic CAS: only the caller that wins this exact draft->active
    // transition proceeds to grant credits/activate a subscription — a
    // concurrent duplicate call loses the CAS and is told the contract is
    // already active instead of double-granting.
    const claimed = await OrganizationContract.findOneAndUpdate(
      { _id: contractId, organizationId, status: 'draft' },
      { $set: { status: 'active', activatedAt: new Date() } },
      { new: true }
    );
    if (!claimed) {
      throw new ApiError(409, 'This contract is already active', undefined, BillingErrorCode.CONTRACT_ALREADY_ACTIVE);
    }

    const contractIdStr = (claimed._id as Types.ObjectId).toString();

    if (claimed.creditAllowance && claimed.creditAllowance > 0) {
      await organizationInterviewCreditService.grantCredits({
        organizationId,
        amount: claimed.creditAllowance,
        referenceType: 'contract',
        referenceId: contractIdStr,
        idempotencyKey: `contract-activate:${contractIdStr}`,
        description: 'Enterprise contract activation',
      });
    }

    if (claimed.planCode) {
      await organizationSubscriptionService.activateFromContract(
        organizationId,
        claimed.planCode,
        { start: claimed.startDate, end: claimed.endDate },
        contractIdStr
      );
    }

    return claimed;
  }

  async expireContract(organizationId: string, contractId: string): Promise<IOrganizationContract> {
    const contract = await this.getContract(organizationId, contractId);
    if (contract.status === 'expired') {
      return contract;
    }
    contract.status = 'expired';
    contract.expiredAt = new Date();
    await contract.save();
    return contract;
  }

  async cancelContract(organizationId: string, contractId: string): Promise<IOrganizationContract> {
    const contract = await this.getContract(organizationId, contractId);
    if (contract.status === 'cancelled') {
      return contract;
    }
    contract.status = 'cancelled';
    contract.cancelledAt = new Date();
    await contract.save();
    return contract;
  }

  async recordManualPayment(input: RecordManualPaymentInput): Promise<IOrganizationManualPayment> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new ApiError(400, 'amountPaise must be a positive integer');
    }
    return OrganizationManualPayment.create({
      organizationId: input.organizationId,
      method: input.method,
      amountPaise: input.amountPaise,
      currency: 'INR',
      referenceNote: input.referenceNote,
      paymentDate: input.paymentDate,
      recordedByAdminUserId: input.recordedByAdminUserId,
      source: 'manual',
      contractId: input.contractId,
      notes: input.notes,
    });
  }

  async listManualPayments(organizationId: string, options: { page?: number; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const [payments, total] = await Promise.all([
      OrganizationManualPayment.find({ organizationId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OrganizationManualPayment.countDocuments({ organizationId }),
    ]);
    return { payments, page, limit, total };
  }
}

export const organizationContractService = new OrganizationContractService();
