import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { organizationProvisioningService } from '../services/OrganizationProvisioningService';
import { OrganizationType } from '../constants/organization';
import { successResponse, createdResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * Super Admin B2B organization provisioning (PR-PROVISIONING). Mounted
 * under `/api/v1/admin/organizations` — protected by the SAME
 * `protect, authorize('admin')` guard as every other admin route (see
 * admin.routes.ts's `router.use(...)`), mirroring
 * organizationContract.controller.ts's convention exactly: never a new RBAC
 * framework, never reachable by an organization owner/admin.
 */

export const createOrganizationAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    name,
    type,
    ownerEmail,
    ownerName,
    description,
    website,
    logoUrl,
    contactEmail,
    contactPhone,
    settings,
    instituteProfile,
    companyProfile,
    planCode,
    idempotencyKey,
  } = req.body;

  const result = await organizationProvisioningService.createOrganizationWithOwner(
    {
      name,
      type,
      ownerEmail,
      ownerName,
      description,
      website,
      logoUrl,
      contactEmail,
      contactPhone,
      settings,
      instituteProfile,
      companyProfile,
      planCode,
      idempotencyKey,
    },
    req.user!.id
  );

  res.status(201).json(createdResponse('Organization created successfully', result));
});

export const listOrganizationsAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10), 100) : 20;
  const type = req.query.type as OrganizationType | undefined;
  const status = req.query.status as any;
  const search = req.query.search as string | undefined;

  const result = await organizationProvisioningService.listOrganizations({ page, limit, type, status, search });
  res.status(200).json(successResponse('Organizations retrieved successfully', result));
});

export const getOrganizationAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const detail = await organizationProvisioningService.getOrganizationDetail(req.params.organizationId);
  res.status(200).json(successResponse('Organization retrieved successfully', detail));
});

export const resendOwnerInvitationAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const invitation = await organizationProvisioningService.resendOwnerInvitation(req.params.organizationId, req.user!.id);
  res.status(200).json(successResponse('Owner invitation resent successfully', { invitation }));
});

export const revokeOwnerInvitationAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const invitation = await organizationProvisioningService.revokeOwnerInvitation(req.params.organizationId, req.user!.id);
  res.status(200).json(successResponse('Owner invitation revoked successfully', { invitation }));
});

export const suspendOrganizationAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const organization = await organizationProvisioningService.suspendOrganization(req.params.organizationId, req.user!.id);
  res.status(200).json(successResponse('Organization suspended successfully', { organization }));
});

export const reactivateOrganizationAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const organization = await organizationProvisioningService.reactivateOrganization(req.params.organizationId, req.user!.id);
  res.status(200).json(successResponse('Organization reactivated successfully', { organization }));
});

export const changeOwnerAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, name } = req.body;
  const result = await organizationProvisioningService.changeOwner(req.params.organizationId, req.user!.id, {
    newOwnerEmail: email,
    newOwnerName: name,
  });
  res.status(200).json(successResponse('Organization owner changed successfully', result));
});
