import { createHash } from 'crypto';

// O avatar é guardado em User.avatarUrl como data-URL base64. Nas listagens isso
// põe dezenas/centenas de KB por linha no JSON e nunca fica em cache do browser.
// Nas listas devolve-se antes uma referência a GET /users/:id/avatar (cacheável).
// Só imagens raster: SVG serviria script no nosso próprio origin.
export const AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

export function isDataUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('data:');
}

export function avatarVersion(dataUrl: string): string {
  return createHash('sha1').update(dataUrl).digest('hex').slice(0, 12);
}

export function parseAvatarDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = DATA_URL.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!(AVATAR_MIME as readonly string[]).includes(mime)) return null;
  return { mime, buffer: Buffer.from(m[2], 'base64') };
}

/** URL a expor numa listagem: referência cacheável se for data-URL, senão inalterado. */
export function avatarRef(userId: number, avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (!isDataUrl(avatarUrl)) return avatarUrl;
  // O `v` muda com o conteúdo, por isso a resposta pode ser `immutable`.
  return `/api/users/${userId}/avatar?v=${avatarVersion(avatarUrl)}`;
}

/** Referência gerada por `avatarRef` — nunca deve voltar a ser gravada como avatar. */
export const AVATAR_REF_RE = /^\/api\/users\/\d+\/avatar(\?|$)/;

const MAX_DEPTH = 12;

/**
 * Troca, em qualquer resposta, o base64 do avatar de um utilizador pela referência
 * cacheável. Só mexe em objetos com a forma de `User` (`fullName` + `avatarUrl`
 * data-URL): `fullName` só existe em `User` (o `Employee` usa `name`), por isso o dono é
 * `userId` (se existir) ou `id`. Sem dono numérico, deixa como está. Não muta o
 * original: devolve cópias só dos ramos alterados (a resposta pode vir de cache).
 */
export function refUserAvatars<T>(value: T, depth = 0): T {
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    let out: unknown[] | null = null;
    value.forEach((item, i) => {
      const next = refUserAvatars(item, depth + 1);
      if (next !== item) (out ??= value.slice())[i] = next;
    });
    return (out ?? value) as T;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Date, Buffer, Decimal, streams…
  const obj = value as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  for (const key of Object.keys(obj)) {
    const next = refUserAvatars(obj[key], depth + 1);
    if (next !== obj[key]) (out ??= { ...obj })[key] = next;
  }
  const cur = out ?? obj;
  if (isDataUrl(cur.avatarUrl as string) && typeof cur.fullName === 'string') {
    const owner = typeof cur.userId === 'number' ? cur.userId : cur.id;
    if (typeof owner === 'number') {
      out = { ...cur, avatarUrl: avatarRef(owner, cur.avatarUrl as string) };
    }
  }
  return (out ?? obj) as T;
}
