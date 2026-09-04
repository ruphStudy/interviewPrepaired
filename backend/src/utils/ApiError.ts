export class ApiError extends Error {
  statusCode: number;
  errors?: any;

  constructor(statusCode: number, message: string, errors?: any) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when a user tries to start a new interview without enough
 * interview credits. Caught explicitly by the interview-start controller
 * (the global error handler doesn't inspect ApiError.statusCode, so a
 * generic ApiError here would surface only as a generic 500) so the client
 * gets a distinguishable, structured response.
 */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_INTERVIEW_CREDITS' as const;
  balance: number;

  constructor(balance: number, message = 'You do not have enough interview credits.') {
    super(message);
    this.name = 'InsufficientCreditsError';
    this.balance = balance;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when an institute organization tries to consume an interview
 * credit without enough balance. Unlike the B2C InsufficientCreditsError
 * (a plain Error requiring an explicit controller-level catch), this
 * extends ApiError so the global error handler alone produces a correct
 * structured 402 response — there is no institute-credit controller yet
 * (15D is foundation-only), so no bespoke catch site exists to translate it.
 */
export class OrganizationInsufficientCreditsError extends ApiError {
  readonly code = 'INSUFFICIENT_ORGANIZATION_INTERVIEW_CREDITS' as const;
  balance: number;

  constructor(balance: number, message = 'This organization does not have enough interview credits.') {
    super(402, message);
    this.name = 'OrganizationInsufficientCreditsError';
    this.balance = balance;
  }
}
