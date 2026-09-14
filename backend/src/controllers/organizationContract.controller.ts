import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { organizationContractService } from '../services/OrganizationContractService';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * Global-admin-only enterprise contract + manual-payment administration
 * (PR-B2B-BILL-5). Mounted under `/api/v1/admin` — protected by the SAME
 * `protect, authorize('admin')` guard as every other admin route (see
 * admin.routes.ts's `router.use(...)`), never a new RBAC framework.
 */

function toContractRow(contract: any) {
  return {
    id: contract._id.toString(),
    organizationId: contract.organizationId.toString(),
    contractCode: contract.contractCode,
    status: contract.status,
    startDate: contract.startDate,
    endDate: contract.endDate,
    billingModel: contract.billingModel,
    planCode: contract.planCode,
    contractValueInrPaise: contract.contractValueInrPaise,
    creditAllowance: contract.creditAllowance,
    renewalTerms: contract.renewalTerms,
    externalReference: contract.externalReference,
    createdByAdminUserId: contract.createdByAdminUserId.toString(),
    activatedAt: contract.activatedAt,
    expiredAt: contract.expiredAt,
    cancelledAt: contract.cancelledAt,
    createdAt: contract.createdAt,
  };
}

function toManualPaymentRow(payment: any) {
  return {
    id: payment._id.toString(),
    organizationId: payment.organizationId.toString(),
    method: payment.method,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    referenceNote: payment.referenceNote,
    paymentDate: payment.paymentDate,
    recordedByAdminUserId: payment.recordedByAdminUserId.toString(),
    source: payment.source,
    contractId: payment.contractId ? payment.contractId.toString() : undefined,
    notes: payment.notes,
    createdAt: payment.createdAt,
  };
}

export const createContractAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { startDate, endDate, billingModel, planCode, contractValueInrPaise, creditAllowance, renewalTerms, externalReference } =
    req.body;
  const contract = await organizationContractService.createContract({
    organizationId: req.params.organizationId,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : undefined,
    billingModel,
    planCode,
    contractValueInrPaise,
    creditAllowance,
    renewalTerms,
    externalReference,
    createdByAdminUserId: req.user!.id,
  });
  res.status(201).json(successResponse('Contract created successfully', toContractRow(contract)));
});

export const listContractsAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const result = await organizationContractService.listContracts(req.params.organizationId, { page, limit });
  res.status(200).json(
    successResponse('Contracts retrieved successfully', {
      contracts: result.contracts.map(toContractRow),
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  );
});

export const getContractAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const contract = await organizationContractService.getContract(req.params.organizationId, req.params.contractId);
  res.status(200).json(successResponse('Contract retrieved successfully', toContractRow(contract)));
});

export const activateContractAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const contract = await organizationContractService.activateContract(req.params.organizationId, req.params.contractId);
  res.status(200).json(successResponse('Contract activated successfully', toContractRow(contract)));
});

export const expireContractAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const contract = await organizationContractService.expireContract(req.params.organizationId, req.params.contractId);
  res.status(200).json(successResponse('Contract expired successfully', toContractRow(contract)));
});

export const cancelContractAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const contract = await organizationContractService.cancelContract(req.params.organizationId, req.params.contractId);
  res.status(200).json(successResponse('Contract cancelled successfully', toContractRow(contract)));
});

export const recordManualPaymentAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { method, amountPaise, referenceNote, paymentDate, contractId, notes } = req.body;
  const payment = await organizationContractService.recordManualPayment({
    organizationId: req.params.organizationId,
    method,
    amountPaise,
    referenceNote,
    paymentDate: new Date(paymentDate),
    recordedByAdminUserId: req.user!.id,
    contractId,
    notes,
  });
  res.status(201).json(successResponse('Manual payment recorded successfully', toManualPaymentRow(payment)));
});

export const listManualPaymentsAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const result = await organizationContractService.listManualPayments(req.params.organizationId, { page, limit });
  res.status(200).json(
    successResponse('Manual payments retrieved successfully', {
      payments: result.payments.map(toManualPaymentRow),
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  );
});
