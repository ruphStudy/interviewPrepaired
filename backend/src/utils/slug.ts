/**
 * Deterministic Latin-alphanumeric slug generation for organization names —
 * no transliteration library, no uniqueness handling (the model's unique
 * index is authoritative; a creation flow resolves collisions later).
 * A non-Latin name may normalize to an empty string — the caller is
 * responsible for supplying a fallback in that case.
 */
export function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics, e.g. "café" -> "cafe"
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumeric -> single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}
