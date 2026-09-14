/**
 * Exact-key-match (case-insensitive) redaction (PR-OPS-3). Deliberately
 * NOT a substring match — a key like `tokenCount` (AI usage tracking) must
 * never be redacted just because it contains "token". Only a key whose
 * lowercased form exactly equals one of SENSITIVE_KEYS has its VALUE (never
 * the key itself) replaced with '[REDACTED]'.
 */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'apikey',
  'signature',
  'resettoken',
  'verificationtoken',
  'accesskey',
  'refreshtoken',
  'jwt',
  'webhooksecret',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 10;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Deep-walks a plain object/array, returning a NEW value with sensitive
 * values redacted. Never mutates the input. Non-plain values (Date, class
 * instances such as Mongoose documents/ObjectIds, etc.) are returned as-is
 * at the leaf level rather than recursed into, to avoid accidentally
 * breaking their serialization.
 */
export function redactSensitive<T>(input: T, depth = 0): T {
  if (input === null || input === undefined || depth >= MAX_DEPTH) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitive(item, depth + 1)) as unknown as T;
  }

  if (isPlainObject(input)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = REDACTED;
      } else {
        result[key] = redactSensitive(value, depth + 1);
      }
    }
    return result as unknown as T;
  }

  return input;
}
