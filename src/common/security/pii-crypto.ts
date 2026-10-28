// Cifra em repouso de PII fiscal/bancária (User.nif, User.nib) — AES-256-GCM.
//
// Valor gravado: `pii:v1:<iv>:<tag>:<dados>` (base64). `decryptPii` aceita também texto em claro
// (linhas anteriores ao backfill `prisma/backfill-encrypt-user-pii.ts`), por isso a migração pode
// ser feita com a app a correr e a leitura nunca falha por mistura de formatos.
// A chave vem de PII_ENCRYPTION_KEY; sem ela cai para AUTOMATION_SECRET_KEY/JWT_SECRET (como
// `encryptSecret`) — em produção definir uma chave própria: rodar JWT_SECRET tornaria o NIF/NIB ilegível.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'pii:v1:';

function key(): Buffer {
  const material =
    process.env.PII_ENCRYPTION_KEY ?? process.env.AUTOMATION_SECRET_KEY ?? process.env.JWT_SECRET;
  if (!material) throw new Error('Defina PII_ENCRYPTION_KEY para cifrar NIF/NIB');
  return createHash('sha256').update(material).digest();
}

export function isEncryptedPii(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** `''`/`null`/`undefined` → `null`; já cifrado → devolve igual (idempotente). */
export function encryptPii(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null;
  if (isEncryptedPii(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join(':');
}

/** Texto em claro (legado) passa tal como está; `null`/`undefined` → `null`. */
export function decryptPii(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!isEncryptedPii(stored)) return stored;
  const [iv, tag, data] = stored
    .slice(PREFIX.length)
    .split(':')
    .map(p => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Devolve cópia com `nif`/`nib` decifrados (só toca nos campos presentes). */
export function decryptUserPii<T extends { nif?: string | null; nib?: string | null }>(user: T): T;
export function decryptUserPii<T extends { nif?: string | null; nib?: string | null }>(
  user: T | null | undefined,
): T | null | undefined;
export function decryptUserPii<T extends { nif?: string | null; nib?: string | null }>(
  user: T | null | undefined,
): T | null | undefined {
  if (!user) return user;
  const out = { ...user };
  if ('nif' in out) out.nif = decryptPii(out.nif);
  if ('nib' in out) out.nib = decryptPii(out.nib);
  return out;
}
