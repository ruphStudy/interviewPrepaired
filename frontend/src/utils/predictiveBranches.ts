import { CONCEPT_REGISTRY, detectConcepts } from './conceptRegistry';

/**
 * Phase 7C — predictive branch preparation.
 *
 * 100% client-side, deterministic, and disposable. Built ONLY from concept
 * keys Phase 2's existing debounced `detectedConcepts` state in
 * useSpeechInterview.ts already produces (no second transcript watcher, no
 * network call, no OpenAI call — "NO EXPENSIVE SPECULATIVE FAN-OUT").
 *
 * A prepared branch is never sent to the backend, never influences the
 * real `POST /interview/answer` call, and never mutates persisted
 * interview state, coverage, or claims. The ONLY thing consuming a
 * "matched" branch can ever do is a presentation/UX nicety (see
 * `matchPreparedBranch`) — it cannot make the real next question appear
 * any sooner than the real backend response already does, since the
 * question TEXT only ever exists once that response resolves.
 *
 * `competencyKey` is deliberately always undefined today: verified against
 * `frontend/src/api/interviewApi.ts` that neither `SubmitAnswerResponse.
 * data.nextQuestion` nor `GetInterviewSessionResponse.data.currentQuestion`
 * expose a competency identifier to the frontend (only `question`/
 * `questionText`, `expectedPoints`, `followUpTopics`) — there is nothing
 * real to put there without fabricating it, so the field is kept honest
 * rather than populated with a guess.
 *
 * `sourcePartialConcept` is the canonical concept KEY (or its display
 * label), never raw transcript text — Phase 2 deliberately never retains
 * raw partial-transcript text (see useSpeechInterview.ts's comments), and
 * this module preserves that same privacy boundary rather than quietly
 * reintroducing it.
 */

export interface PredictiveBranchQuestionContext {
  expectedPoints?: string[];
  followUpTopics?: string[];
}

export interface PredictiveBranch {
  conceptKey: string;
  /** Always undefined today — see file header. Reserved for a future phase where the backend exposes competency identifiers to the frontend. */
  competencyKey?: string;
  likelyProbeTypes: string[];
  sourcePartialConcept: string;
  confidence: number;
  preparedAt: number;
}

/** Bounded per the master prompt: "top 2-3", never more. */
export const MAX_PREDICTIVE_BRANCHES = 3;

// A coarse, static, local-only categorization used purely to produce a
// plausible-sounding `likelyProbeTypes` hint. This is NOT derived from any
// real backend probe-type taxonomy (none is exposed to the frontend), so
// its predictive value is intentionally modest — see the module's report
// notes. Every entry is generic/neutral, never evaluative.
const DATASTORE_CONCEPTS = new Set([
  'redis', 'kafka', 'mongodb', 'postgresql', 'mysql', 'elasticsearch', 'rabbitmq',
]);
const ARCHITECTURE_CONCEPTS = new Set([
  'microservices', 'eventDriven', 'loadBalancing', 'sharding', 'replication', 'circuitBreaker', 'scaling', 'caching', 'queues', 'asyncProcessing',
]);
const PLATFORM_CONCEPTS = new Set(['docker', 'kubernetes', 'aws', 'azure', 'gcp', 'cicd', 'observability']);
const LANGUAGE_CONCEPTS = new Set(['typescript', 'javascript', 'python', 'java', 'nodejs', 'nestjs', 'react']);
const API_CONCEPTS = new Set(['graphql', 'rest', 'websocket', 'grpc', 'rateLimiting', 'cdn']);
const SECURITY_CONCEPTS = new Set(['authentication', 'authorization']);
const DATA_CONCEPTS = new Set(['indexing', 'transactions']);

function likelyProbeTypesFor(conceptKey: string): string[] {
  if (DATASTORE_CONCEPTS.has(conceptKey)) return ['tradeoffs', 'failure-handling'];
  if (ARCHITECTURE_CONCEPTS.has(conceptKey)) return ['tradeoffs', 'scaling-limits'];
  if (PLATFORM_CONCEPTS.has(conceptKey)) return ['operational-detail', 'tradeoffs'];
  if (LANGUAGE_CONCEPTS.has(conceptKey)) return ['deeper-example'];
  if (API_CONCEPTS.has(conceptKey)) return ['deeper-example', 'edge-cases'];
  if (SECURITY_CONCEPTS.has(conceptKey)) return ['edge-cases', 'failure-handling'];
  if (DATA_CONCEPTS.has(conceptKey)) return ['deeper-example', 'tradeoffs'];
  return ['deeper-example'];
}

function contextText(context: PredictiveBranchQuestionContext | undefined): string {
  if (!context) return '';
  return [...(context.expectedPoints || []), ...(context.followUpTopics || [])].join(' \n ').toLowerCase();
}

function conceptAppearsIn(conceptKey: string, haystack: string): boolean {
  if (!haystack) return false;
  const entry = CONCEPT_REGISTRY[conceptKey];
  if (!entry) return false;
  return entry.aliases.some((alias) => haystack.includes(alias.toLowerCase()));
}

/**
 * Pure, deterministic ranking/bounding of speculative branches from the
 * concepts Phase 2 has already detected in the candidate's still-in-
 * progress transcript. `detectedConcepts` is taken in the SAME order
 * useSpeechInterview.ts accumulates it (earlier-detected first) — that
 * insertion order is used as a cheap recency proxy since no per-concept
 * timestamp is tracked upstream.
 *
 * `now` is injected (not read via Date.now() internally) so this stays a
 * pure, directly-assertable function.
 */
export function derivePredictiveBranches(
  detectedConcepts: string[],
  questionContext: PredictiveBranchQuestionContext | undefined,
  now: number,
  maxBranches: number = MAX_PREDICTIVE_BRANCHES
): PredictiveBranch[] {
  if (!Array.isArray(detectedConcepts) || detectedConcepts.length === 0) return [];

  const haystack = contextText(questionContext);
  const total = detectedConcepts.length;

  const scored = detectedConcepts.map((conceptKey, index) => {
    // Later in the array = more recently detected = weighted higher.
    const recencyScore = (index + 1) / total;
    const continuityBonus = conceptAppearsIn(conceptKey, haystack) ? 0.2 : 0;
    const confidence = Math.min(1, 0.4 + 0.4 * recencyScore + continuityBonus);
    return { conceptKey, index, confidence };
  });

  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.index - a.index; // tie-break: more recent wins
  });

  return scored.slice(0, Math.max(0, maxBranches)).map((entry) => ({
    conceptKey: entry.conceptKey,
    competencyKey: undefined,
    likelyProbeTypes: likelyProbeTypesFor(entry.conceptKey),
    sourcePartialConcept: CONCEPT_REGISTRY[entry.conceptKey]?.label || entry.conceptKey,
    confidence: entry.confidence,
    preparedAt: now,
  }));
}

export interface RealNextQuestionForMatch {
  question: string;
  expectedPoints?: string[];
  followUpTopics?: string[];
}

/**
 * Compares the REAL next question (only ever known once the authoritative
 * `POST /interview/answer` response resolves) against previously prepared
 * branches. Returns the highest-confidence branch whose concept is
 * genuinely present in the real question's text/expectedPoints/
 * followUpTopics, or null.
 *
 * Honesty note (per the master prompt): this match is bookkeeping only. By
 * the time it can run, the real question text already exists and is
 * already being rendered (Phase 7D shows it immediately) — matching a
 * branch cannot make that appear any sooner. The only legitimate use of
 * the result is a presentation nicety (e.g. skipping a redundant local
 * recompute, or a subtle "this follows what you were discussing" framing)
 * and/or local metrics about how often speculation tracked reality. It
 * must never gate or accelerate any actual state transition beyond what
 * Phase 7D's immediate-visibility fix already does unconditionally.
 */
export function matchPreparedBranch(
  branches: PredictiveBranch[],
  nextQuestion: RealNextQuestionForMatch | null | undefined
): PredictiveBranch | null {
  if (!branches || branches.length === 0 || !nextQuestion) return null;

  const haystack = [
    nextQuestion.question || '',
    ...(nextQuestion.expectedPoints || []),
    ...(nextQuestion.followUpTopics || []),
  ]
    .join(' \n ')
    .toLowerCase();

  if (!haystack.trim()) return null;

  let best: PredictiveBranch | null = null;
  for (const branch of branches) {
    if (!conceptAppearsIn(branch.conceptKey, haystack)) continue;
    if (!best || branch.confidence > best.confidence) best = branch;
  }
  return best;
}

/**
 * Also re-runs the existing (already-debounced) concept detector once more
 * over the full accumulated answer text — mirrors the same "one last
 * synchronous pass" pattern useSpeechInterview.ts's stopListening() already
 * uses, so a concept mentioned only in the very last debounce window is not
 * silently excluded from branch preparation. Does not add a new debounce
 * timer of its own.
 */
export function withFinalConceptPass(detectedConcepts: string[], finalAnswerText: string): string[] {
  return Array.from(new Set([...detectedConcepts, ...detectConcepts(finalAnswerText)]));
}
