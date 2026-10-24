// src/common/files/file-fixtures.ts
// Construtores de ficheiros mínimos mas estruturalmente válidos, só para testes.
/** `pad`: bytes de enchimento válidos entre o IHDR e o IEND, para chegar a um tamanho. */
export const png = (w = 10, h = 10, pad = 0): Buffer => {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(w, 8);
  ihdr.writeUInt32BE(h, 12);
  ihdr.set([8, 2, 0, 0, 0], 16);
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
    Buffer.alloc(pad, 1),
    iend,
  ]);
};

/** `pad`: bytes de enchimento em segmentos COM (comentários), que o formato admite. */
export const jpeg = (w = 10, h = 10, pad = 0): Buffer => {
  const app0 = Buffer.from([
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Buffer.from('JFIF\0'),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 8], 0);
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  sof.set([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 9);
  const com: Buffer[] = [];
  for (let left = pad; left > 0; left -= 60000) {
    const n = Math.min(left, 60000);
    com.push(Buffer.from([0xff, 0xfe, (n + 2) >> 8, (n + 2) & 255]), Buffer.alloc(n, 0x20));
  }
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, ...com, sof, Buffer.from([0xff, 0xd9])]);
};

export const gif = (w = 10, h = 10): Buffer => {
  const b = Buffer.alloc(14);
  b.write('GIF89a', 0, 'ascii');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  b[13] = 0x3b;
  return b;
};

export const webp = (w = 10, h = 10): Buffer => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(22, 4);
  b.write('WEBPVP8X', 8, 'ascii');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};

export const pdf = (body = ''): Buffer =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog ${body} >>\nendobj\ntrailer\n<< >>\n%%EOF\n`,
    'latin1',
  );

export interface ZipSpec {
  name: string;
  data?: string;
  /** Tamanhos declarados no directório central (para simular zip bombs). */
  declaredUncompressed?: number;
  declaredCompressed?: number;
  encrypted?: boolean;
}

/** ZIP "stored" (sem compressão) com directório central; os tamanhos declarados podem mentir. */
export const zip = (specs: ZipSpec[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const s of specs) {
    const name = Buffer.from(s.name, 'utf8');
    const data = Buffer.from(s.data ?? 'x', 'utf8');
    const flags = s.encrypted ? 1 : 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(flags, 6);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(flags, 8);
    central.writeUInt32LE(s.declaredCompressed ?? data.length, 20);
    central.writeUInt32LE(s.declaredUncompressed ?? data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(specs.length, 8);
  eocd.writeUInt16LE(specs.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
};

export const docx = (extra: ZipSpec[] = []): Buffer =>
  zip([{ name: '[Content_Types].xml' }, { name: 'word/document.xml' }, ...extra]);

export const dataUrl = (mime: string, bytes: Buffer): string =>
  `data:${mime};base64,${bytes.toString('base64')}`;
