/**
 * PR-OPS-AI-1 — classifies a caught OpenAI SDK error (or an internal
 * OpenAIService failure like an empty/malformed response) into a small,
 * stable set of internal codes, so a transient/retryable provider failure
 * (timeout, rate limit, quota, 5xx) is distinguishable from a genuine
 * application bug — both by a caller that wants to branch on it, and in the
 * HTTP response's `code` field for the frontend. Never changes retry
 * behavior itself (the `openai` SDK's own `maxRetries`/`timeout` already
 * handle bounded retry/backoff — see OpenAIService's constructor) — this is
 * purely post-hoc classification of whatever error the SDK ultimately
 * surfaced after its own retries were exhausted.
 */

import { ApiError } from '../utils/ApiError';

export const AI_ERROR_CODES = [
  'AI_TIMEOUT',
  'AI_RATE_LIMITED',
  'AI_QUOTA_EXCEEDED',
  'AI_AUTH_FAILED',
  'AI_PROVIDER_ERROR',
  'AI_INVALID_RESPONSE',
  'AI_UNKNOWN',
] as const;

export type AIErrorCode = (typeof AI_ERROR_CODES)[number];

/** Thrown by OpenAIService's single call-choke-point (`callOpenAI`/`createEmbeddings`) instead of a bare `Error` — same `.message` contract every existing caller already reads, plus a `.code` new callers can branch on. */
export class AIProviderError extends Error {
  readonly code: AIErrorCode;

  constructor(code: AIErrorCode, message: string) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Pure classification — never throws, never logs (the caller already logs
 * the raw error). Message-based special cases (empty/malformed response,
 * both thrown internally by OpenAIService itself, never by the SDK) are
 * checked first since they carry no HTTP status; everything else is
 * classified from the `openai` SDK's own `APIError` shape
 * (`status`/`code`/`type`, e.g. RateLimitError.status === 429).
 */
export function classifyOpenAIError(error: any): AIErrorCode {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message === 'No response from OpenAI' || message === 'Failed to parse AI response as JSON') {
    return 'AI_INVALID_RESPONSE';
  }

  // APIConnectionTimeoutError extends APIConnectionError — both have
  // status: undefined, so a name check is the only reliable signal.
  if (error?.name === 'APIConnectionTimeoutError' || error?.code === 'ETIMEDOUT') {
    return 'AI_TIMEOUT';
  }
  if (error?.name === 'APIConnectionError') {
    return 'AI_PROVIDER_ERROR';
  }

  const status: number | undefined = typeof error?.status === 'number' ? error.status : undefined;
  const innerCode: string | undefined = error?.code ?? error?.error?.code;
  const innerType: string | undefined = error?.type ?? error?.error?.type;

  if (status === 429) {
    if (innerCode === 'insufficient_quota' || innerType === 'insufficient_quota') {
      return 'AI_QUOTA_EXCEEDED';
    }
    return 'AI_RATE_LIMITED';
  }
  if (status === 401 || status === 403) {
    return 'AI_AUTH_FAILED';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'AI_PROVIDER_ERROR';
  }

  return 'AI_UNKNOWN';
}

/** User-safe, non-technical message per code — never echoes the raw provider error text to the client. */
export const AI_ERROR_USER_MESSAGES: Record<AIErrorCode, string> = {
  AI_TIMEOUT: 'The interviewer took too long to respond. Please try again.',
  AI_RATE_LIMITED: 'The interviewer is handling a lot of requests right now. Please try again in a moment.',
  AI_QUOTA_EXCEEDED: 'The AI service is temporarily unavailable. Please try again later.',
  AI_AUTH_FAILED: 'The AI service is temporarily unavailable. Please try again later.',
  AI_PROVIDER_ERROR: 'The AI service is temporarily unavailable. Please try again in a moment.',
  AI_INVALID_RESPONSE: 'We had trouble processing that. Please try again.',
  AI_UNKNOWN: 'Something went wrong. Please try again.',
};

/**
 * Every AI error code maps to a RETRYABLE 503 (transient provider/response
 * issue), never a 500 — a 500 is reserved for genuine application bugs, and
 * conflating the two would make the frontend unable to distinguish "try
 * again in a moment" from "something is actually broken here".
 */
export const AI_ERROR_HTTP_STATUS = 503;

/**
 * Maps a caught error to an ApiError for a controller/service catch block:
 * an `AIProviderError` becomes a 503 with its own `code` and a safe
 * user-facing message (never the raw provider error text). An error that is
 * ALREADY an `ApiError` (e.g. re-thrown from a nested call that already ran
 * through this same mapping, or an unrelated business-rule error like a 409
 * conflict) is passed through completely unchanged — this function must
 * never downgrade/mangle an already-correct ApiError into a generic 500.
 * Anything else falls back to the caller's own existing 500 + message
 * convention, completely unchanged.
 */
export function toAIAwareApiError(error: unknown, fallbackMessage: string): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof AIProviderError) {
    return new ApiError(AI_ERROR_HTTP_STATUS, AI_ERROR_USER_MESSAGES[error.code], undefined, error.code);
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return new ApiError(500, `${fallbackMessage}: ${message}`);
}

