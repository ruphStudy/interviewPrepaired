import { Types } from 'mongoose';
import Interview, { IAIUsage } from '../models/interview.model';
import { getModelPricing } from '../config/openaiPricing';

export interface RecordUsageParams {
  interviewId: string;
  operation: string;
  model: string;
  questionIndex?: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8; // 8dp — keeps small per-call costs from truncating to 0
}

/**
 * Persists one real, already-completed OpenAI call's actual usage against its
 * interview. Never called speculatively — only after a successful response.
 * Awaited by the caller (OpenAIService.callOpenAI) before it returns, so a
 * final-report-generation call's cost is durably recorded before the report
 * response is built.
 */
export async function recordAIUsage(params: RecordUsageParams): Promise<void> {
  const { interviewId, operation, model, questionIndex, promptTokens, cachedTokens, completionTokens, totalTokens } = params;

  const pricing = getModelPricing(model);
  const nonCachedInputTokens = Math.max(promptTokens - cachedTokens, 0);

  let inputCostUsd = 0;
  let cachedInputCostUsd = 0;
  let outputCostUsd = 0;
  let pricingStatus: 'calculated' | 'unknown' = 'unknown';

  if (pricing) {
    inputCostUsd = round((nonCachedInputTokens / 1_000_000) * pricing.inputPerMillionUsd);
    cachedInputCostUsd = pricing.cachedInputPerMillionUsd
      ? round((cachedTokens / 1_000_000) * pricing.cachedInputPerMillionUsd)
      : 0;
    outputCostUsd = round((completionTokens / 1_000_000) * pricing.outputPerMillionUsd);
    pricingStatus = 'calculated';
  }

  const totalCostUsd = pricingStatus === 'calculated' ? round(inputCostUsd + cachedInputCostUsd + outputCostUsd) : 0;

  console.log('[AIUsage]', {
    interviewId,
    operation,
    model,
    inputTokens: promptTokens,
    cachedInputTokens: cachedTokens,
    outputTokens: completionTokens,
    totalTokens,
    costUsd: pricingStatus === 'calculated' ? totalCostUsd : null,
  });

  const callRecord: Record<string, unknown> = {
    operation,
    model,
    inputTokens: promptTokens,
    cachedInputTokens: cachedTokens,
    outputTokens: completionTokens,
    totalTokens,
    inputCostUsd,
    cachedInputCostUsd,
    outputCostUsd,
    totalCostUsd,
    pricingStatus,
    timestamp: new Date(),
  };
  if (questionIndex !== undefined) callRecord.questionIndex = questionIndex;

  try {
    await Interview.updateOne(
      { _id: new Types.ObjectId(interviewId) },
      {
        $push: { 'aiUsage.calls': callRecord },
        $inc: {
          'aiUsage.totals.inputTokens': promptTokens,
          'aiUsage.totals.cachedInputTokens': cachedTokens,
          'aiUsage.totals.outputTokens': completionTokens,
          'aiUsage.totals.totalTokens': totalTokens,
          'aiUsage.totals.inputCostUsd': inputCostUsd,
          'aiUsage.totals.cachedInputCostUsd': cachedInputCostUsd,
          'aiUsage.totals.outputCostUsd': outputCostUsd,
          'aiUsage.totals.totalCostUsd': totalCostUsd,
          'aiUsage.totals.callCount': 1,
          'aiUsage.totals.pricingCompleteCallCount': pricingStatus === 'calculated' ? 1 : 0,
        },
      }
    );
  } catch (err) {
    // Never let cost bookkeeping fail the underlying AI request/response.
    console.error('[AIUsage] Failed to persist usage (non-critical):', err);
  }
}

export interface AICostBreakdownEntry {
  operation: string;
  callCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AICostReport {
  tracked: boolean;
  currency: 'USD';
  totalCostUsd: number;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  callCount: number;
  pricingComplete: boolean;
  breakdown: AICostBreakdownEntry[];
}

const OPERATION_LABELS: Record<string, string> = {
  'question-generation': 'Question Generation',
  'answer-evaluation': 'Answer Evaluation',
  'model-answer-generation': 'Expected Answer Generation',
  'final-report-generation': 'Final Report Generation',
  'star-analysis': 'STAR Analysis',
  'memory-extraction': 'Memory Extraction',
  'claim-verification': 'Claim Verification',
  'contradiction-detection': 'Contradiction Detection',
  'coverage-tracking': 'Competency Coverage Tracking',
};

function getOperationLabel(operation: string): string {
  return OPERATION_LABELS[operation] || operation;
}

/** Returns null (never a fabricated zero-cost object) when the interview predates AI usage tracking. */
export function buildAICostReport(aiUsage: IAIUsage | undefined): AICostReport | null {
  if (!aiUsage || !aiUsage.calls || aiUsage.calls.length === 0) return null;

  const byOperation = new Map<string, AICostBreakdownEntry>();
  for (const call of aiUsage.calls) {
    const existing = byOperation.get(call.operation) || {
      operation: getOperationLabel(call.operation),
      callCount: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    existing.callCount += 1;
    existing.inputTokens += call.inputTokens;
    existing.cachedInputTokens += call.cachedInputTokens;
    existing.outputTokens += call.outputTokens;
    existing.costUsd = round(existing.costUsd + call.totalCostUsd);
    byOperation.set(call.operation, existing);
  }

  const totals = aiUsage.totals;
  return {
    tracked: true,
    currency: 'USD',
    totalCostUsd: totals.totalCostUsd,
    totalTokens: totals.totalTokens,
    inputTokens: totals.inputTokens,
    cachedInputTokens: totals.cachedInputTokens,
    outputTokens: totals.outputTokens,
    callCount: totals.callCount,
    pricingComplete: totals.callCount > 0 && totals.pricingCompleteCallCount === totals.callCount,
    breakdown: Array.from(byOperation.values()),
  };
}
