import { FILE_POLICIES } from '../../common/files/file-policies';

/**
 * Validação segura de imagens carregadas para os certificados. Não confia no tipo
 * declarado: confere os bytes (assinatura do ficheiro, estrutura e dimensões).
 * Só PNG e JPEG — nunca SVG (pode conter scripts), GIF ou WebP.
 */
export const MAX_IMAGE_BYTES = FILE_POLICIES.IMAGE.maxBytes;

export type InspectedImage =
  | { ok: true; mime: 'image/png' | 'image/jpeg'; bytes: Buffer; width: number; height: number }
  | { ok: false; error: string };

const DATA_URL_PREFIX = /^data:([\w.+/-]+);base64,/;
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
// 2 MB em base64 ocupa ~2,8 M caracteres: recusar antes de descodificar.
const MAX_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function pngSize(b: Buffer): { width: number; height: number } | string {
  if (b.length < 33 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'O conteúdo do ficheiro não é um PNG válido.';
  }
  if (b.subarray(12, 16).toString('ascii') !== 'IHDR') return 'PNG inválido (cabeçalho em falta).';
  if (!b.subarray(b.length - 12).equals(PNG_IEND)) return 'PNG truncado ou corrompido.';
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegSize(b: Buffer): { width: number; height: number } | string {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) {
    return 'O conteúdo do ficheiro não é um JPEG válido.';
  }
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return 'JPEG truncado ou corrompido.';
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 'JPEG inválido (estrutura corrompida).';
    while (b[i + 1] === 0xff) i++; // bytes de preenchimento
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (i + 9 > b.length) return 'JPEG truncado ou corrompido.';
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (marker === 0xda) return 'JPEG inválido (dimensões em falta).';
    i += 2 + b.readUInt16BE(i + 2);
  }
  return 'JPEG inválido (dimensões em falta).';
}

/** `maxDimension`: lado máximo em píxeis (logótipo/assinatura 4000, fundo 6000). */
export function inspectImage(dataUrl: string, maxDimension = 4000): InspectedImage {
  const p = typeof dataUrl === 'string' ? DATA_URL_PREFIX.exec(dataUrl.slice(0, 128)) : null;
  if (!p) return fail('A imagem tem de ser um ficheiro PNG ou JPEG carregado.');
  const mime = p[1];
  if (mime !== 'image/png' && mime !== 'image/jpeg') {
    return fail(
      'Só são aceites imagens PNG ou JPEG (SVG, GIF e outros formatos não são permitidos).',
    );
  }
  const body = dataUrl.slice(p[0].length);
  // Tamanho antes da regex: correr a regex sobre vários MB rebenta a stack do V8.
  if (body.length > MAX_BASE64_CHARS) return fail('A imagem excede 2 MB.');
  if (!BASE64_BODY.test(body))
    return fail('A imagem tem de ser um ficheiro PNG ou JPEG carregado.');
  const bytes = Buffer.from(body, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) return fail('A imagem excede 2 MB.');

  const size = mime === 'image/png' ? pngSize(bytes) : jpegSize(bytes);
  if (typeof size === 'string') return fail(size);
  if (size.width < 1 || size.height < 1) return fail('A imagem tem dimensões inválidas.');
  if (size.width > maxDimension || size.height > maxDimension) {
    return fail(`A imagem excede ${maxDimension}×${maxDimension} píxeis.`);
  }
  return { ok: true, mime, bytes, width: size.width, height: size.height };
}
