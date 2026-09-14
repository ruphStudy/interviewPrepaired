import { Response } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth';
import { operationalJobService } from '../services/OperationalJobService';
import { OperationalJobType } from '../constants/operationalJob';
import { computeReadiness } from '../services/ReadinessService';

/**
 * Admin-only operational job visibility + manual retry (PR-OPS-1/2).
 * Reuses the same admin RBAC as every other admin route
 * (`protect, authorize('admin')` on the router). Never accepts an
 * arbitrary job type/payload from the request — retry only re-runs the
 * SAME job row's existing type/payload.
 */
export const listOperationalJobsAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
  const jobType = typeof req.query.jobType === 'string' ? (req.query.jobType as OperationalJobType) : undefined;

  const result = await operationalJobService.listJobs({ status, jobType, page, limit });
  res.status(200).json(successResponse('Operational jobs retrieved successfully', result));
});

export const getOperationalJobAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const job = await operationalJobService.getJob(req.params.jobId);
  res.status(200).json(successResponse('Operational job retrieved successfully', job));
});

export const retryOperationalJobAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new ApiError(401, 'Not authorized to access this route');
  }
  const job = await operationalJobService.manualRetry(req.params.jobId, req.user.id);
  res.status(200).json(successResponse('Operational job scheduled for retry', job));
});

/**
 * Deeper ops diagnostics (PR-OPS-4) — DB ping + job-poller health + the
 * same configured/not-configured provider flags as /ready, with more
 * detail. Still NEVER makes a live network call to a third-party provider.
 */
export const getOpsDiagnosticsAdmin = catchAsync(async (_req: AuthRequest, res: Response) => {
  const readiness = computeReadiness();

  let databasePing: 'ok' | 'unavailable' = 'unavailable';
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
      databasePing = 'ok';
    }
  } catch {
    databasePing = 'unavailable';
  }

  res.status(200).json(
    successResponse('Operational diagnostics retrieved successfully', {
      status: readiness.status,
      databasePing,
      dependencies: readiness.dependencies,
    })
  );
});
