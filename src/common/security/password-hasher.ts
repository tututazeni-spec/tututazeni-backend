// Hashing de senhas — Argon2id (vencedor da PHC, recomendação OWASP) com pepper.
//
// - Sal: gerado pelo Argon2 e embutido no hash (único por hash, 16 bytes aleatórios).
// - Pepper (PASSWORD_PEPPER): segredo fora da BD aplicado por HMAC-SHA256 antes do
//   Argon2. Um dump da BD sozinho não permite ataque offline às senhas. Também
//   remove o limite de 72 bytes do bcrypt (o HMAC tem sempre 44 chars).
// - Hashes bcrypt legados continuam a verificar-se e são migrados para Argon2id
//   no próximo login com sucesso (ver `needsRehash`).
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

// Algorithm.Argon2id — literal porque `const enum` não sobrevive a isolatedModules.
const ARGON2ID = 2;

const intEnv = (name: string, fallback: number, min: number): number => {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? Math.max(n, min) : fallback;
};

// Piso OWASP é m=19 MiB, t=2, p=1. Pomos acima: 64 MiB, t=3 (~100-200 ms).
export const ARGON2_MEMORY_KIB = intEnv('ARGON2_MEMORY_KIB', 65536, 19456);
export const ARGON2_TIME_COST = intEnv('ARGON2_TIME_COST', 3, 2);
export const ARGON2_PARALLELISM = intEnv('ARGON2_PARALLELISM', 1, 1);

const options = () => ({
  algorithm: ARGON2ID,
  memoryCost: ARGON2_MEMORY_KIB,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
});

function pepper(plain: string): string {
  const secret = process.env.PASSWORD_PEPPER;
  if (!secret) return plain;
  return crypto.createHmac('sha256', secret).update(plain, 'utf8').digest('base64');
}

export const isArgon2Hash = (stored: string): boolean => stored.startsWith('$argon2id$');
export const isBcryptHash = (stored: string): boolean => /^\$2[aby]\$/.test(stored);

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(pepper(plain), options());
}

export interface PasswordCheck {
  valid: boolean;
  /** Hash legado, parâmetros abaixo do actual ou pepper introduzido depois: re-gravar. */
  needsRehash: boolean;
}

function argonParamsOutdated(stored: string): boolean {
  const m = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored);
  if (!m) return true;
  return (
    parseInt(m[1], 10) < ARGON2_MEMORY_KIB ||
    parseInt(m[2], 10) < ARGON2_TIME_COST ||
    parseInt(m[3], 10) < ARGON2_PARALLELISM
  );
}

export async function verifyPassword(plain: string, stored: string): Promise<PasswordCheck> {
  if (isArgon2Hash(stored)) {
    if (await argonVerify(stored, pepper(plain)).catch(() => false)) {
      return { valid: true, needsRehash: argonParamsOutdated(stored) };
    }
    // Pepper introduzido depois de o hash ter sido gravado: aceita uma vez e re-grava.
    if (process.env.PASSWORD_PEPPER && (await argonVerify(stored, plain).catch(() => false))) {
      return { valid: true, needsRehash: true };
    }
    return { valid: false, needsRehash: false };
  }
  if (isBcryptHash(stored)) {
    const valid = await bcrypt.compare(plain, stored).catch(() => false);
    return { valid, needsRehash: valid };
  }
  return { valid: false, needsRehash: false };
}

let dummyHash: Promise<string> | undefined;

/**
 * Gasta o mesmo tempo que uma verificação real. Usar quando o utilizador não existe
 * ou não tem senha, para o tempo de resposta não revelar se a conta existe.
 */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  await argonVerify(await dummyHash, pepper(plain)).catch(() => false);
}
