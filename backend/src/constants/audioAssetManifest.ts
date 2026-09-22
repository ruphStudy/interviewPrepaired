/**
 * Phase 9 ("Hybrid Audio Architecture") — the audio-asset manifest.
 *
 * ONE entry per (PHRASE_LIBRARY phrase, locale) pair, generated DIRECTLY
 * from `PHRASE_LIBRARY` (never hand-typed phrase ids that could drift) so a
 * future edit to a phrase's wording is automatically reflected in a fresh
 * `textHash` — see `audioAssetManifest.test.ts`'s drift-detection test for
 * the exact property this buys.
 *
 * Every entry today is `enabled: false` with no `audioUrl`/`assetPath` —
 * this is an HONEST scaffold, not a placeholder bug: no prerecorded audio
 * file exists anywhere in this codebase, or in any object-storage bucket,
 * for ANY phrase yet (`backend/src/constants/storage.ts`'s
 * `StoredFileCategory` deliberately has no audio category either — there is
 * nothing real to store). `AudioRoutingService`
 * (services/AudioRoutingService.ts) treats every lookup here — a missing
 * entry, a disabled entry, or a locale with zero coverage — as "asset
 * unavailable, fall through to the next routing tier", never as an error.
 *
 * Locale scope: only `'en-IN'`, because `PHRASE_LIBRARY` itself is
 * English-only (see `InterviewService.buildPresentationPlanSafely`, which
 * already skips humanization entirely for hi-IN/mr-IN). Fabricating
 * untranslated hi-IN/mr-IN manifest entries would misrepresent locale
 * coverage that doesn't exist — `getManifestEntry` for those locales
 * returns `undefined` cleanly, proven by this file's test.
 */

import * as crypto from 'crypto';
import { PHRASE_LIBRARY, Phrase, PhraseCategory } from './phraseLibrary';

export interface ManifestEntry {
  phraseId: string;
  category: PhraseCategory;
  locale: string;
  provider: string;
  voice: string;
  audioUrl?: string;
  assetPath?: string;
  durationMs?: number;
  textHash: string;
  version: number;
  enabled: boolean;
}

/** The only locale `PHRASE_LIBRARY` covers today — see file header. Adding a translated phrase library later (a future phase's job) is the only thing that should ever grow this list. */
const MANIFEST_LOCALES = ['en-IN'] as const;

/**
 * Normalization matching `InterviewAnswerOrchestratorService.normalizeAnswer`'s
 * established convention in this codebase (trim + collapse internal
 * whitespace) — reused here (not reinvented) so "exact text" hashing means
 * the same thing everywhere it's used.
 */
export function normalizePhraseTextForHash(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * SHA-256 hex digest over the normalized text — mirrors
 * `InterviewBlueprint.model.ts`'s `generateHash` convention
 * (`crypto.createHash('sha256')...digest('hex')`), the established hashing
 * idiom in this codebase.
 */
export function computePhraseTextHash(text: string): string {
  return crypto.createHash('sha256').update(normalizePhraseTextForHash(text)).digest('hex');
}

function buildManifestEntry(phrase: Phrase, locale: string): ManifestEntry {
  return {
    phraseId: phrase.id,
    category: phrase.category,
    locale,
    // Honest sentinel values: no real TTS asset provider/voice is wired up
    // anywhere in this codebase — never 'chirp3'/'neural2'/a fabricated
    // voice name until a real provider is actually registered
    // (config/ttsProviderRegistry.ts).
    provider: 'none',
    voice: 'unassigned',
    audioUrl: undefined,
    assetPath: undefined,
    durationMs: undefined,
    textHash: computePhraseTextHash(phrase.text),
    version: 1,
    enabled: false,
  };
}

export const AUDIO_ASSET_MANIFEST: ManifestEntry[] = MANIFEST_LOCALES.flatMap((locale) =>
  PHRASE_LIBRARY.map((phrase) => buildManifestEntry(phrase, locale))
);

const manifestIndex = new Map<string, ManifestEntry>();
for (const entry of AUDIO_ASSET_MANIFEST) {
  manifestIndex.set(`${entry.phraseId}::${entry.locale}`, entry);
}

/**
 * Clean lookup for ROUTING use — returns `undefined` (never throws, never
 * fabricates a placeholder) for: an unknown phraseId, a locale with no
 * manifest coverage (hi-IN/mr-IN today), or an entry that exists but is
 * `enabled: false`. `AudioRoutingService` must treat `undefined` as "fall
 * through to the next routing tier", never as an error.
 */
export function getManifestEntry(phraseId: string, locale: string): ManifestEntry | undefined {
  const entry = manifestIndex.get(`${phraseId}::${locale}`);
  if (!entry || !entry.enabled) return undefined;
  return entry;
}

/** Raw lookup INCLUDING disabled entries — for validators/tests/introspection only. Routing decisions must always go through `getManifestEntry`. */
export function getManifestEntryRaw(phraseId: string, locale: string): ManifestEntry | undefined {
  return manifestIndex.get(`${phraseId}::${locale}`);
}

// ---------------------------------------------------------------------------
// Validators — pure functions, exercised by audioAssetManifest.test.ts.
// ---------------------------------------------------------------------------

export interface ManifestValidationIssue {
  phraseId: string;
  locale: string;
  reason: string;
}

/** Every manifest entry's `phraseId` must exist in `PHRASE_LIBRARY`, and there must be no duplicate `(phraseId, locale)` pair. */
export function validateManifestStructure(manifest: ManifestEntry[] = AUDIO_ASSET_MANIFEST): ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = [];
  const seen = new Set<string>();
  const knownPhraseIds = new Set(PHRASE_LIBRARY.map((p) => p.id));
  for (const entry of manifest) {
    const key = `${entry.phraseId}::${entry.locale}`;
    if (!knownPhraseIds.has(entry.phraseId)) {
      issues.push({ phraseId: entry.phraseId, locale: entry.locale, reason: 'phraseId not found in PHRASE_LIBRARY' });
    }
    if (seen.has(key)) {
      issues.push({ phraseId: entry.phraseId, locale: entry.locale, reason: 'duplicate (phraseId, locale) pair' });
    }
    seen.add(key);
  }
  return issues;
}

/** Detects drift: a manifest entry's stored `textHash` no longer matches a FRESH hash of `PHRASE_LIBRARY`'s current text for that `phraseId`. This is what makes a future wording edit automatically detectable rather than silently stale. */
export function findTextHashMismatches(manifest: ManifestEntry[] = AUDIO_ASSET_MANIFEST): ManifestValidationIssue[] {
  const byId = new Map(PHRASE_LIBRARY.map((p) => [p.id, p] as const));
  const issues: ManifestValidationIssue[] = [];
  for (const entry of manifest) {
    const phrase = byId.get(entry.phraseId);
    if (!phrase) continue; // already reported by validateManifestStructure
    const freshHash = computePhraseTextHash(phrase.text);
    if (freshHash !== entry.textHash) {
      issues.push({ phraseId: entry.phraseId, locale: entry.locale, reason: 'textHash does not match current PHRASE_LIBRARY text' });
    }
  }
  return issues;
}
