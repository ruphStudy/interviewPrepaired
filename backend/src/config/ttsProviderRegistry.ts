/**
 * Phase 9 ("Hybrid Audio Architecture") — the ONE place that answers
 * "is a real [provider] registered today" for audio.
 *
 * Both answers are `false` right now: there is no backend TTS provider
 * (Google Cloud TTS/Chirp3/Neural2 or any other) anywhere in this codebase
 * — confirmed by Phase 7's investigation and re-confirmed this phase — and
 * no audio object-storage/CDN category exists in
 * `backend/src/constants/storage.ts`'s `StoredFileCategory` either
 * (deliberately not added this phase: there is no real audio file to
 * store).
 *
 * This is a config/registry SEAM, not a hardcoded assumption baked into
 * `AudioRoutingService`'s decision logic — that service calls these
 * functions rather than comparing against a literal `false`, so wiring up
 * a real provider later is a change to THIS file (or to the env vars it
 * reads) only; no routing/plan-building call site needs to change.
 */

export function isDynamicTtsProviderRegistered(): boolean {
  return process.env.DYNAMIC_TTS_PROVIDER_ENABLED === 'true';
}

export function isAudioAssetCdnRegistered(): boolean {
  return process.env.AUDIO_ASSET_CDN_ENABLED === 'true';
}
