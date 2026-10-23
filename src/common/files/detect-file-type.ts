// src/common/files/detect-file-type.ts
// Deteta o tipo REAL de um ficheiro a partir dos bytes (nunca do MIME/extensão declarados).
// Sem dependências: só assinaturas. `dangerous` marca executáveis e conteúdo activo no browser.
import { readZipDirectory } from './zip-directory';

export type FileKind =
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'zip'
  | 'ole2' // .doc/.xls/.ppt legados
  | 'mp4'
  | 'm4a'
  | 'webm'
  | 'mp3'
  | 'wav'
  | 'gzip'
  | 'rar'
  | '7z'
  | 'text'
  | 'unknown';

export interface DetectedFile {
  kind: FileKind;
  /** MIMEs que este conteúdo pode legitimamente ter (ex.: text → text/plain e text/csv). */
  mimes: string[];
  /** Presente se o conteúdo é executável ou activo (HTML/SVG/script). Motivo legível. */
  dangerous?: string;
}

const OOXML_MIMES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

const startsWith = (b: Buffer, sig: number[], offset = 0): boolean =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, from: number, to: number): string => b.toString('latin1', from, to);

/** Executáveis binários pelo número mágico. */
function binaryDanger(b: Buffer): string | undefined {
  if (startsWith(b, [0x4d, 0x5a])) return 'executável Windows (PE/MZ)';
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return 'executável Linux (ELF)';
  if (
    startsWith(b, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(b, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(b, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(b, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWith(b, [0xca, 0xfe, 0xba, 0xbe]) // Mach-O fat / classe Java
  ) {
    return 'executável (Mach-O/Java)';
  }
  if (startsWith(b, [0x23, 0x21])) return 'script com shebang (#!)';
  return undefined;
}

/** Texto que o browser executa: HTML, SVG, XML com script, PHP. */
function activeTextDanger(b: Buffer): string | undefined {
  const head = b.toString('utf8', 0, Math.min(b.length, 2048)).toLowerCase();
  if (/<\?php/.test(head)) return 'script PHP';
  if (/<\s*(!doctype\s+html|html|head|body|iframe|object|embed)\b/.test(head)) return 'HTML';
  if (/<\s*svg\b/.test(head)) return 'SVG (pode conter scripts)';
  if (/<\s*script\b/.test(head)) return 'script embutido';
  if (/^\s*javascript:/.test(head)) return 'URL javascript:';
  return undefined;
}

function isUtf8Text(b: Buffer): boolean {
  const sample = b.subarray(0, 8192);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return true;
  } catch {
    // O corte da amostra pode partir um carácter multibyte no fim: tolerar até 3 bytes.
    for (let cut = 1; cut <= 3 && cut < sample.length; cut++) {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(sample.subarray(0, sample.length - cut));
        return true;
      } catch {
        /* tenta cortar mais um byte */
      }
    }
    return false;
  }
}

function detectZipFlavour(b: Buffer): DetectedFile {
  const dir = readZipDirectory(b);
  if (dir.ok === false) return { kind: 'zip', mimes: ['application/zip'] };
  const names = dir.entries.map(e => e.name);
  if (!names.includes('[Content_Types].xml')) return { kind: 'zip', mimes: ['application/zip'] };
  if (names.some(n => n.startsWith('word/'))) return { kind: 'docx', mimes: [OOXML_MIMES.docx] };
  if (names.some(n => n.startsWith('xl/'))) return { kind: 'xlsx', mimes: [OOXML_MIMES.xlsx] };
  if (names.some(n => n.startsWith('ppt/'))) return { kind: 'pptx', mimes: [OOXML_MIMES.pptx] };
  return { kind: 'zip', mimes: ['application/zip'] };
}

export function detectFileType(buf: Buffer): DetectedFile {
  const danger = binaryDanger(buf);
  if (danger) return { kind: 'unknown', mimes: [], dangerous: danger };

  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'png', mimes: ['image/png'] };
  }
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: 'jpeg', mimes: ['image/jpeg'] };
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') {
    return { kind: 'gif', mimes: ['image/gif'] };
  }
  if (ascii(buf, 0, 4) === 'RIFF' && buf.length >= 12) {
    const form = ascii(buf, 8, 12);
    if (form === 'WEBP') return { kind: 'webp', mimes: ['image/webp'] };
    if (form === 'WAVE') return { kind: 'wav', mimes: ['audio/wav'] };
  }
  if (ascii(buf, 0, 5) === '%PDF-') return { kind: 'pdf', mimes: ['application/pdf'] };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) {
    return detectZipFlavour(buf);
  }
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return {
      kind: 'ole2',
      mimes: ['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'],
    };
  }
  if (ascii(buf, 4, 8) === 'ftyp') {
    return ascii(buf, 8, 12) === 'M4A '
      ? { kind: 'm4a', mimes: ['audio/mp4'] }
      : { kind: 'mp4', mimes: ['video/mp4'] };
  }
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'webm', mimes: ['video/webm'] };
  if (
    ascii(buf, 0, 3) === 'ID3' ||
    (buf.length > 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0)
  ) {
    return { kind: 'mp3', mimes: ['audio/mpeg'] };
  }
  if (startsWith(buf, [0x1f, 0x8b])) return { kind: 'gzip', mimes: ['application/gzip'] };
  if (ascii(buf, 0, 4) === 'Rar!') return { kind: 'rar', mimes: ['application/vnd.rar'] };
  if (startsWith(buf, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return { kind: '7z', mimes: ['application/x-7z-compressed'] };
  }

  if (isUtf8Text(buf)) {
    const active = activeTextDanger(buf);
    if (active) return { kind: 'text', mimes: [], dangerous: active };
    return { kind: 'text', mimes: ['text/plain', 'text/csv'] };
  }
  return { kind: 'unknown', mimes: [] };
}
