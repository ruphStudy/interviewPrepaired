import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerIntegrationConnectionService } from '../services/EmployerIntegrationConnectionService';
import { employerIntegrationDeliveryService } from '../services/EmployerIntegrationDeliveryService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. External integration foundation (31D/31E) — NEVER returns a stored secret; a signing secret is only ever included in the exact create/regenerate response that generated it. */
export class EmployerIntegrationConnectionController {
  public createConnection = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const result = await employerIntegrationConnectionService.createConnection(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      req.body
    );
    res.status(201).json(successResponse('Integration connection created successfully', result));
  });

  public listConnections = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const result = await employerIntegrationConnectionService.listConnections(context.organizationId, context.role);
    res.status(200).json(successResponse('Integration connections retrieved successfully', result));
  });

  public getConnection = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { connectionId } = req.params;
    const result = await employerIntegrationConnectionService.getConnection(context.organizationId, context.role, connectionId);
    res.status(200).json(successResponse('Integration connection retrieved successfully', result));
  });

  public updateConnection = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { connectionId } = req.params;
    const result = await employerIntegrationConnectionService.updateConnection(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      connectionId,
      req.body
    );
    res.status(200).json(successResponse('Integration connection updated successfully', result));
  });

  public disableConnection = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { connectionId } = req.params;
    const result = await employerIntegrationConnectionService.disableConnection(context.organizationId, context.role, connectionId);
    res.status(200).json(successResponse('Integration connection disabled successfully', result));
  });

  public validateConnection = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { connectionId } = req.params;
    const result = await employerIntegrationConnectionService.validateConnection(context.organizationId, context.role, connectionId);
    res.status(200).json(successResponse('Integration connection validated', result));
  });

  public testConnection = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { connectionId } = req.params;
    const result = await employerIntegrationDeliveryService.sendTestWebhook(context.organizationId, context.role, connectionId);
    res.status(200).json(successResponse('Test event sent', result));
  });

  public listDeliveries = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { connectionId } = req.params;
    const result = await employerIntegrationDeliveryService.listDeliveries(context.organizationId, context.role, connectionId);
    res.status(200).json(successResponse('Deliveries retrieved successfully', result));
  });

  public retryDelivery = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { connectionId, deliveryId } = req.params;
    const result = await employerIntegrationDeliveryService.retryDelivery(context.organizationId, context.role, connectionId, deliveryId);
    res.status(200).json(successResponse('Delivery retried', result));
  });

  public processPendingDeliveries = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    // Internal/admin retry-all endpoint (31D section 9) — structured so a future cron/worker can call the same underlying method.
    const result = await employerIntegrationDeliveryService.processPendingDeliveries();
    res.status(200).json(successResponse('Pending deliveries processed', result));
  });
}

export const employerIntegrationConnectionController = new EmployerIntegrationConnectionController();
export default employerIntegrationConnectionController;
