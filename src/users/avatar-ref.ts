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
