// src/common/files/inspect-content.ts
// Verificações estruturais por tipo, sobre os bytes já descodificados. Cada função devolve
// `null` se está tudo bem ou o motivo da rejeição (mensagem em PT para o utilizador).
import { readZipDirectory } from './zip-directory';

// ─── PDF ─────────────────────────────────────────────────────────────────────

// Acções que executam código ou largam ficheiros. /OpenAction e /AA ficam de fora: aparecem
// em PDFs legítimos (ir para a página 1). Nomes PDF admitem escapes `#xx` (/J#61vaScript).
const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)(?![A-Za-z0-9])/;
const PDF_MAX_SCAN_BYTES = 16 * 1024 * 1024;

/**
 * Remove o conteúdo entre `stream` e `endstream`: são bytes (normalmente comprimidos) onde um
 * "/JS" aparece por acaso — num PDF de 5 MB isso acontece com probabilidade não desprezável.
 * Só se procuram acções activas nos dicionários. JS dentro de object streams comprimidos
 * (PDF ≥ 1.5) não é visível aqui: limite conhecido, a mitigar com cabeçalho de download seguro.
 */
function withoutStreams(text: string): string {
  const parts: string[] = [];
  let pos = 0;
  for (;;) {
    const start = text.indexOf('stream', pos);
    if (start < 0) break;
    if (text.startsWith('endstream', start - 3)) {
      parts.push(text.slice(pos, start + 6));
      pos = start + 6;
      continue;
    }
    const end = text.indexOf('endstream', start + 6);
    parts.push(text.slice(pos, start + 6));
    if (end < 0) {
      pos = text.length;
      break;
    }
    pos = end;
  }
  parts.push(text.slice(pos));
  return parts.join('');
}

export function pdfProblem(b: Buffer): string | null {
  if (b.toString('latin1', 0, 5) !== '%PDF-') return 'O ficheiro não é um PDF válido.';
  if (!b.toString('latin1', Math.max(0, b.length - 1024)).includes('%%EOF')) {
    return 'PDF truncado ou corrompido.';
  }
  const text = withoutStreams(b.subarray(0, PDF_MAX_SCAN_BYTES).toString('latin1')).replace(
    /#([0-9a-fA-F]{2})/g,
    (_m, h: string) => String.fromCharCode(parseInt(h, 16)),
  );
  const hit = PDF_ACTIVE.exec(text);
  if (hit) return `O PDF contém conteúdo activo não permitido (/${hit[1]}).`;
  return null;
}

// ─── OOXML (docx/xlsx/pptx) ──────────────────────────────────────────────────

export interface OoxmlLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  /** Razão máxima descomprimido/comprimido para entradas grandes (> 1 MB). */
  maxRatio: number;
}

export const DEFAULT_OOXML_LIMITS: OoxmlLimits = {
  maxEntries: 2000,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalBytes: 150 * 1024 * 1024,
  maxRatio: 200,
};

const OOXML_FORBIDDEN_EXT = /\.(exe|dll|bat|cmd|com|scr|msi|js|jse|vbs|vbe|ps1|sh|jar|hta|lnk)$/i;

export function ooxmlProblem(b: Buffer, limits: OoxmlLimits = DEFAULT_OOXML_LIMITS): string | null {
  const dir = readZipDirectory(b);
  if (dir.ok === false) return dir.error;
  const { entries } = dir;
  if (entries.length > limits.maxEntries) return 'O documento tem demasiadas partes internas.';
  if (!entries.some(e => e.name === '[Content_Types].xml')) {
    return 'O ficheiro não é um documento Office válido.';
  }
  let total = 0;
  for (const e of entries) {
    const n = e.name.replace(/\\/g, '/');
    if (n !== e.name || n.startsWith('/') || n.split('/').includes('..')) {
      return 'O documento contém caminhos internos inseguros.';
    }
    if (e.encrypted) return 'Documentos Office protegidos por palavra-passe não são permitidos.';
    if (/(^|\/)vbaProject\.bin$/i.test(n))
      return 'O documento contém macros (VBA), que não são permitidas.';
    if (OOXML_FORBIDDEN_EXT.test(n)) return 'O documento contém um ficheiro executável embutido.';
    if (e.uncompressedSize > limits.maxEntryBytes)
      return 'O documento descomprimido é demasiado grande.';
    if (
      e.uncompressedSize > 1024 * 1024 &&
      e.uncompressedSize / Math.max(e.compressedSize, 1) > limits.maxRatio
    ) {
      return 'O documento tem uma taxa de compressão suspeita.';
    }
    total += e.uncompressedSize;
    if (total > limits.maxTotalBytes) return 'O documento descomprimido é demasiado grande.';
  }
  return null;
}

// ─── Imagens ─────────────────────────────────────────────────────────────────

export interface ImageInfo {
  width: number;
  height: number;
}

export function pngInfo(b: Buffer): ImageInfo | string {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || !sig.every((v, i) => b[i] === v)) return 'O ficheiro não é um PNG válido.';
  if (b.toString('ascii', 12, 16) !== 'IHDR') return 'PNG inválido (cabeçalho em falta).';
  const end = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  if (!b.subarray(b.length - 12).equals(end)) return 'PNG truncado ou corrompido.';
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export function jpegInfo(b: Buffer): ImageInfo | string {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) {
    return 'O ficheiro não é um JPEG válido.';
  }
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return 'JPEG truncado ou corrompido.';
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 'JPEG inválido (estrutura corrompida).';
    while (b[i + 1] === 0xff) i++;
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

export function gifInfo(b: Buffer): ImageInfo | string {
  if (b.length < 14) return 'GIF truncado ou corrompido.';
  if (b[b.length - 1] !== 0x3b) return 'GIF truncado ou corrompido.';
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

export function webpInfo(b: Buffer): ImageInfo | string {
  if (b.length < 30) return 'WebP truncado ou corrompido.';
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return 'WebP inválido.';
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return 'WebP inválido.';
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  return 'WebP inválido.';
}

export const MAX_IMAGE_PIXELS = 40_000_000;

export function imageProblem(info: ImageInfo | string, maxDimension: number): string | null {
  if (typeof info === 'string') return info;
  if (info.width < 1 || info.height < 1) return 'A imagem tem dimensões inválidas.';
  if (info.width > maxDimension || info.height > maxDimension) {
    return `A imagem excede ${maxDimension}×${maxDimension} píxeis.`;
  }
  if (info.width * info.height > MAX_IMAGE_PIXELS) return 'A imagem tem píxeis a mais.';
  return null;
}
