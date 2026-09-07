import crypto from 'crypto';
import { env } from '../config/environment';

/**
 * Reversible, authenticated encryption for integration secrets AT REST
 * (31D) — this project has no dedicated secrets-encryption infrastructure,
 * so this uses Node's own built-in `crypto` module (AES-256-GCM, no new
 * package) rather than either (a) a home-rolled reversible encoding, which
 * the spec explicitly forbids, or (b) a one-way hash, which would make
 * HMAC-signing future webhook deliveries impossible. The key is derived
 * from the existing `JWT_SECRET` via scrypt with a fixed, purpose-specific
 * salt — never logged, never returned through any API response.
 */
const KEY = crypto.scryptSync(env.jwtSecret, 'enterskill-integration-secret-v1', 32);
const IV_LENGTH = 12;

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted secret');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Cryptographically random webhook signing secret — shown to the employer ONCE at creation, never again. */
export function generateWebhookSigningSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
