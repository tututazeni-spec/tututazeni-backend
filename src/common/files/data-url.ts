// src/common/files/data-url.ts
// Parser de data URLs base64 sem regex sobre o payload (pode ter milhões de caracteres e um
// regex com captura rebentava a pilha). Mede o tamanho ANTES de descodificar.
const HEADER_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,/;
const HEADER_MAX_CHARS = 128;

const isBase64Char = (c: number): boolean =>
  (c >= 65 && c <= 90) || // A-Z
  (c >= 97 && c <= 122) || // a-z
  (c >= 48 && c <= 57) || // 0-9
  c === 43 || // +
  c === 47; // /

/** Mesma regra de `[A-Za-z0-9+/]+={0,2}`, sem regex: o payload nunca é copiado nem recursivo. */
export function base64PayloadLength(
  value: string,
  start: number,
): { length: number; padding: number } | null {
  let end = value.length;
  let padding = 0;
  while (padding < 2 && end > start && value.charCodeAt(end - 1) === 61) {
    end--;
    padding++;
  }
  if (end === start) return null;
  for (let i = start; i < end; i++) {
    if (!isBase64Char(value.charCodeAt(i))) return null;
  }
  return { length: value.length - start, padding };
}

/**
 * MIME a gravar para um ficheiro: se for um data URL, o do próprio cabeçalho (já confirmado pelos
 * bytes pelo validador do DTO), ignorando o `mimeType` que o cliente enviou à parte; senão o declarado.
 */
export function mimeOfInlineFile(fileUrl: string, declared?: string | null): string | undefined {
  const m = HEADER_RE.exec(fileUrl.slice(0, HEADER_MAX_CHARS));
  if (!m) return declared ?? undefined;
  const mime = m[1].toLowerCase();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

/** 5242880 -> "5 MB"; 153600 -> "150 KB". */
export function formatLimit(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
    : `${Math.round(bytes / 1000)} KB`;
}

export type ParsedDataUrl =
  { ok: true; declaredMime: string; bytes: Buffer } | { ok: false; error: string };

/** Bytes decodificados que um payload base64 de `chars` caracteres ocupa (limite superior). */
export const maxDecodedBytes = (chars: number): number => Math.floor((chars * 3) / 4);

export function parseDataUrl(value: unknown, maxBytes: number): ParsedDataUrl {
  const invalid = { ok: false, error: 'Ficheiro inválido (esperado data URL base64).' } as const;
  if (typeof value !== 'string') return invalid;
  const m = HEADER_RE.exec(value.slice(0, HEADER_MAX_CHARS));
  if (!m) return invalid;
  const tooBig = {
    ok: false,
    error: `O ficheiro excede ${formatLimit(maxBytes)}.`,
  } as const;
  // Rejeita pelo tamanho antes de percorrer o payload (o padding tira no máximo 2 bytes).
  if (maxDecodedBytes(value.length - m[0].length) - 2 > maxBytes) return tooBig;
  const payload = base64PayloadLength(value, m[0].length);
  if (!payload) return invalid;
  if (maxDecodedBytes(payload.length) - payload.padding > maxBytes) return tooBig;
  const bytes = Buffer.from(value.slice(m[0].length), 'base64');
  if (bytes.length > maxBytes) return tooBig;
  if (bytes.length === 0) return { ok: false, error: 'O ficheiro está vazio.' };
  // `image/jpg` não é um MIME oficial mas é o que alguns clientes enviam.
  const declaredMime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  return { ok: true, declaredMime, bytes };
}
