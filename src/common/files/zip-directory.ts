// src/common/files/zip-directory.ts
// Lê só o directório central de um ZIP (nomes e tamanhos declarados). Nunca descomprime:
// serve para validar pacotes OOXML e recusar zip bombs sem gastar memória nem CPU.
// Limite conhecido: os tamanhos são os declarados no directório; um ZIP que minta sobre eles
// só é apanhado por quem descomprime (Word/Excel) — daí os limites também sobre o tamanho comprimido.

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  encrypted: boolean;
}

export type ZipDirectory = { ok: true; entries: ZipEntry[] } | { ok: false; error: string };

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;
export const MAX_ZIP_ENTRIES = 5000;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function readZipDirectory(buf: Buffer): ZipDirectory {
  if (buf.length < EOCD_MIN) return fail('Arquivo ZIP truncado.');
  const lowest = Math.max(0, buf.length - EOCD_MIN - MAX_COMMENT);
  let eocd = -1;
  for (let i = buf.length - EOCD_MIN; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return fail('Directório central do ZIP não encontrado.');

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return fail('ZIP64 não é suportado.');
  }
  if (total > MAX_ZIP_ENTRIES)
    return fail(`O pacote tem demasiadas entradas (máx. ${MAX_ZIP_ENTRIES}).`);
  if (cdOffset + cdSize > eocd) return fail('Directório central do ZIP inválido.');

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) {
      return fail('Directório central do ZIP corrompido.');
    }
    const flags = buf.readUInt16LE(p + 8);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      return fail('ZIP64 não é suportado.');
    }
    const end = p + 46 + nameLen + extraLen + commentLen;
    if (end > eocd) return fail('Directório central do ZIP corrompido.');
    entries.push({
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      compressedSize,
      uncompressedSize,
      encrypted: (flags & 1) === 1,
    });
    p = end;
  }
  return { ok: true, entries };
}
