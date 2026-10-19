import { randomBytes } from 'crypto';

// Crockford base32: sem I, L, O, U (ambíguos ao ler/ditar o código).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_CODE_LENGTH = 64;

export function generateVerificationCode(length = 16): string {
  // 256 % 32 === 0 → sem enviesamento ao usar o byte módulo 32.
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

/** Normaliza o código introduzido por um utilizador; null se não puder ser um código válido. */
export function normalizeVerificationCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[-\s]/g, '');
  if (code.length === 0 || code.length > MAX_CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}
