// src/common/files/safe-download.ts
// Headers para servir ficheiros cujo nome ou tipo vêm de dados guardados (evidências, exports).
//  - Content-Disposition conforme RFC 6266/5987: fallback ASCII + filename* em UTF-8, sem aspas,
//    barras, CR/LF ou caracteres de controlo (impede header injection e nomes enganadores).
//  - Content-Type só se estiver na lista segura; qualquer outro (text/html, svg, xml, js, lixo)
//    sai como application/octet-stream e nunca inline.
//  - Inline só para PDF e imagens raster, e mesmo assim com CSP sandbox + nosniff.
import { ALLOWED_MIME_TYPES } from '../validators/allowed-mime-types';
import { sanitizeFileName } from './sanitize-file-name';

const INLINE_SAFE: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

// Allowlist de MIMEs aceites além dos de upload: formatos que a própria aplicação gera.
const DOWNLOAD_SAFE: ReadonlySet<string> = new Set([
  ...ALLOWED_MIME_TYPES,
  'application/json',
  'application/zip',
]);

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const NON_ASCII_PRINTABLE = /[^\x20-\x7e]/g;
const HEADER_UNSAFE = /["\\%;]/g;

/** `Content-Disposition` seguro. O nome passa sempre por `sanitizeFileName`. */
export function contentDisposition(
  filename: unknown,
  disposition: 'attachment' | 'inline' = 'attachment',
): string {
  const clean = sanitizeFileName(filename, 'ficheiro');
  const ascii = clean.replace(NON_ASCII_PRINTABLE, '_').replace(HEADER_UNSAFE, '_');
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** MIME seguro para servir: o declarado se estiver na lista, senão `application/octet-stream`. */
export function safeContentType(mime: unknown): string {
  const base = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  if (!MIME_RE.test(base) || !DOWNLOAD_SAFE.has(base)) return 'application/octet-stream';
  return base.startsWith('text/') ? `${base}; charset=utf-8` : base;
}

export interface SafeDownloadOptions {
  filename: unknown;
  mime: unknown;
  /** Só tem efeito para PDF e imagens raster; tudo o resto é sempre `attachment`. */
  allowInline?: boolean;
  /** Headers adicionais (ex.: X-Audit-Export-Code, Cache-Control). */
  extra?: Record<string, string>;
}

export function safeDownloadHeaders(opts: SafeDownloadOptions): Record<string, string> {
  const contentType = safeContentType(opts.mime);
  const inline = !!opts.allowInline && INLINE_SAFE.has(contentType);
  return {
    'Content-Type': contentType,
    'Content-Disposition': contentDisposition(opts.filename, inline ? 'inline' : 'attachment'),
    'X-Content-Type-Options': 'nosniff',
    // Mesmo que um browser decida mostrar o ficheiro, não executa nada nem acede à origem.
    'Content-Security-Policy': "sandbox; default-src 'none'",
    ...opts.extra,
  };
}
