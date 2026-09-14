/**
 * Defense-in-depth sanitization for a filename placed into a
 * `Content-Disposition` header value (PR-STORAGE-5) — strips CR/LF (header
 * injection) and double quotes (which would otherwise terminate the
 * quoted-string early), and bounds the length. Upload-time sanitization
 * already restricts stored `originalFileName` values to a safe charset, so
 * this is a second, independent layer rather than the only one.
 */
export function sanitizeContentDispositionFileName(name: string): string {
  const stripped = name.replace(/[\r\n"]/g, '').trim();
  return (stripped || 'file').slice(0, 255);
}
