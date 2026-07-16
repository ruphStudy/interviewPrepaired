import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError';

/**
 * Middleware to check validation results after validation chains have run
 */
export const validate = async (req: Request, _res: Response, next: NextFunction) => {
  console.log('🔍 [Validate] Checking validation results...');
  const errors = validationResult(req);
  
  if (errors.isEmpty()) {
    console.log('✅ [Validate] Validation passed');
    return next();
  }

  const extractedErrors = errors.array().map((err: any) => ({
    field: err.path || err.param,
    message: err.msg,
    value: err.value,
  }));

  console.error('❌ [Validate] Validation failed:', extractedErrors);
  
  // Pass error to next() instead of throwing to prevent unhandled rejection
  const apiError = new ApiError(400, 'Validation Error', extractedErrors);
  return next(apiError);
};
