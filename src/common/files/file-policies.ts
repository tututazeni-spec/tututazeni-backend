// src/common/files/file-policies.ts
// Fonte única dos limites de upload: que MIMEs e que tamanho (em BYTES descodificados) por
// categoria. Os valores reflectem os limites que já estavam em vigor em cada DTO (não alargam
// nada). Os tipos legados do Office (.doc/.xls/.ppt) ficam de fora de propósito: não dá para os
// inspeccionar em busca de macros sem um parser CFB.
export interface FilePolicy {
  name: string;
  mimes: readonly string[];
  maxBytes: number;
  /** Só imagens: lado máximo em píxeis. */
  maxDimension?: number;
}

const KB = 1000;
const MB = 1024 * 1024;

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const OFFICE_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;
const DOCUMENT_MIMES = [
  'application/pdf',
  ...OFFICE_MIMES,
  ...IMAGE_MIMES,
  'text/plain',
  'text/csv',
] as const;

export const FILE_POLICIES = {
  /** Foto de perfil. 150 KB: espelha o frontend (antes: @MaxLength(200_000) em base64). */
  AVATAR: { name: 'AVATAR', mimes: IMAGE_MIMES, maxBytes: 150 * KB, maxDimension: 2000 },
  /** Imagem de cartão (capa de curso, plano de formação, PDI). 512 KB. */
  CARD_IMAGE: { name: 'CARD_IMAGE', mimes: IMAGE_MIMES, maxBytes: 512 * 1024, maxDimension: 4000 },
  /** Logótipo/assinatura/fundo de certificado. */
  IMAGE: { name: 'IMAGE', mimes: IMAGE_MIMES, maxBytes: 2 * MB, maxDimension: 4000 },
  /** Imagem de avatar de formação (aceita GIF). */
  TRAINING_AVATAR_IMAGE: {
    name: 'TRAINING_AVATAR_IMAGE',
    mimes: [...IMAGE_MIMES, 'image/gif'],
    maxBytes: 5 * MB,
    maxDimension: 4000,
  },
  /** PDF de lição e certificado externo importado. */
  PDF: { name: 'PDF', mimes: ['application/pdf'], maxBytes: 5 * MB },
  /** PDF de documento de onboarding. */
  ONBOARDING_PDF: { name: 'ONBOARDING_PDF', mimes: ['application/pdf'], maxBytes: 3 * MB },
  /** Comprovativos de licença e documentos de formação (PDF ou imagem). */
  ATTACHMENT: {
    name: 'ATTACHMENT',
    mimes: ['application/pdf', ...IMAGE_MIMES],
    maxBytes: 4 * MB,
    maxDimension: 4000,
  },
  OFFICE: { name: 'OFFICE', mimes: OFFICE_MIMES, maxBytes: 10 * MB },
  TEXT: { name: 'TEXT', mimes: ['text/plain', 'text/csv'], maxBytes: 1 * MB },
  /** Documento genérico (biblioteca de conteúdos): PDF, Office, imagem, texto. */
  DOCUMENT: { name: 'DOCUMENT', mimes: DOCUMENT_MIMES, maxBytes: 5 * MB, maxDimension: 4000 },
  /** Evidência de auditoria enviada em base64 num campo próprio. */
  EVIDENCE: { name: 'EVIDENCE', mimes: DOCUMENT_MIMES, maxBytes: 5 * MB, maxDimension: 4000 },
} as const satisfies Record<string, FilePolicy>;

export type FilePolicyName = keyof typeof FILE_POLICIES;

/** Caracteres base64 necessários para `bytes` (4 por cada 3 bytes). */
export const base64Chars = (bytes: number): number => Math.ceil(bytes / 3) * 4;

/**
 * Comprimento máximo da string `data:<mime>;base64,<payload>` para uma política, para usar como
 * `@MaxLength` de guarda barata. A fronteira exacta é sempre em bytes (ver parseDataUrl).
 */
export const maxDataUrlChars = (policy: FilePolicy): number => base64Chars(policy.maxBytes) + 128;

// ─── Tamanho DECLARADO de ficheiros guardados fora (metadados `fileSize`) ────────────────────
// O backend não recebe os bytes: só o tamanho que o cliente diz. Limita-se por família de MIME
// em vez de um único teto de 200 MB para tudo.
const EXTERNAL_LIMITS: ReadonlyArray<{ test: (mime: string) => boolean; maxBytes: number }> = [
  { test: m => m.startsWith('video/') || m.startsWith('audio/'), maxBytes: 200 * MB },
  { test: m => m.startsWith('image/'), maxBytes: 25 * MB },
  { test: m => m.startsWith('text/'), maxBytes: 25 * MB },
];
export const DEFAULT_EXTERNAL_MAX_BYTES = 100 * MB; // pdf, Office, restantes

export function maxExternalBytesFor(mime: string | undefined | null): number {
  const m = (mime ?? '').toLowerCase();
  return EXTERNAL_LIMITS.find(l => l.test(m))?.maxBytes ?? DEFAULT_EXTERNAL_MAX_BYTES;
}
