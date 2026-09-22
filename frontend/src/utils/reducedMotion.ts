/**
 * Phase 10C — the one centralized `prefers-reduced-motion` check.
 *
 * A CSS-only reduced-motion rule already exists in
 * `components/Interview/styles.css`, but that stylesheet is not imported
 * anywhere in the app (verified: `main.tsx` only imports `index.css`) — so
 * it is dead code today, not a real, active mechanism this module could
 * "reuse". This is therefore a genuinely new, minimal, JS-accessible check
 * (the master spec's fallback instruction for "if none exists, add a
 * minimal, standard check"), kept in exactly one place so nothing else in
 * the presentation layer calls `window.matchMedia` directly.
 *
 * Used to gate the micro-behavior scheduler's OWN decision to select a
 * behavior at all (utils/microBehaviorScheduler.ts) — not merely to shrink
 * a CSS transition after the fact.
 */
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // A browser without matchMedia, or one that throws on this query,
    // should never be treated as "wants reduced motion" nor crash the
    // scheduler — fail open to the ordinary (non-reduced) presentation.
    return false;
  }
}
