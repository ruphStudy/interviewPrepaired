import dns from 'dns';
import { env } from '../config/environment';
import { ApiError } from './ApiError';

/**
 * Minimal SSRF-protection utility (31D) — this project has no existing
 * SSRF-guard infrastructure, so this is a small, dependency-free
 * implementation reused everywhere an employer-supplied URL is ever
 * fetched from the server (generic webhook endpoints today). Both the
 * LITERAL hostname AND its resolved IP address(es) are checked — the
 * latter defends against DNS-rebinding a public-looking hostname to a
 * private/loopback/link-local/metadata address after validation.
 */
const MAX_URL_LENGTH = 2048;

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 0) return true; // "this network"
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true; // loopback
  if (normalized.startsWith('fe80:')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local (fc00::/7)
  if (normalized.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — re-check the embedded IPv4 address.
    return isPrivateOrReservedIPv4(normalized.replace('::ffff:', ''));
  }
  return false;
}

/**
 * Throws a generic, non-leaky ApiError for any unsafe/invalid outbound
 * URL. Allows plain HTTP + localhost ONLY outside production, matching
 * this project's existing `env.nodeEnv` dev/prod convention — never in
 * production.
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    throw new ApiError(400, 'A valid endpoint URL is required');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(400, 'Invalid URL');
  }

  const isDev = env.nodeEnv !== 'production';
  const allowedProtocols = isDev ? ['http:', 'https:'] : ['https:'];
  if (!allowedProtocols.includes(url.protocol)) {
    throw new ApiError(400, isDev ? 'URL must use http or https' : 'URL must use https');
  }

  if (url.username || url.password) {
    throw new ApiError(400, 'URL must not contain embedded credentials');
  }

  const hostname = url.hostname.toLowerCase();
  const devLoopbackHosts = ['localhost', '127.0.0.1', '::1'];
  if (!isDev && devLoopbackHosts.includes(hostname)) {
    throw new ApiError(400, 'This URL is not allowed');
  }

  if (isDev && devLoopbackHosts.includes(hostname)) {
    return url; // Explicit local-development allowance only.
  }

  let addresses: string[];
  try {
    const results = await dns.promises.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new ApiError(400, 'Could not resolve this URL');
  }
  if (addresses.length === 0) {
    throw new ApiError(400, 'Could not resolve this URL');
  }

  for (const address of addresses) {
    const unsafe = address.includes(':') ? isPrivateOrReservedIPv6(address) : isPrivateOrReservedIPv4(address);
    if (unsafe) {
      throw new ApiError(400, 'This URL resolves to a disallowed network address');
    }
  }

  return url;
}
