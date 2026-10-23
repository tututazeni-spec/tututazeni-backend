// src/common/files/file-policies.ts
// Política por categoria de upload: que MIMEs, que tamanho (em BYTES descodificados) e, nas
// imagens, que dimensões. Os tipos legados do Office (.doc/.xls/.ppt) ficam de fora de propósito:
// não dá para os inspeccionar em busca de macros sem um parser CFB.
export interface FilePolicy {
  name: string;
  mimes: readonly string[];
  maxBytes: number;
  /** Só imagens: lado máximo em píxeis. */
  maxDimension?: number;
}

const MB = 1024 * 1024;

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const OFFICE_MIMES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const FILE_POLICIES = {
  AVATAR: { name: 'AVATAR', mimes: IMAGE_MIMES, maxBytes: 1 * MB, maxDimension: 2000 },
  IMAGE: { name: 'IMAGE', mimes: IMAGE_MIMES, maxBytes: 2 * MB, maxDimension: 4000 },
  PDF: { name: 'PDF', mimes: ['application/pdf'], maxBytes: 5 * MB },
  OFFICE: { name: 'OFFICE', mimes: OFFICE_MIMES, maxBytes: 10 * MB },
  TEXT: { name: 'TEXT', mimes: ['text/plain', 'text/csv'], maxBytes: 1 * MB },
  /** Documento genérico (biblioteca de conteúdos, certificados externos): PDF, Office, imagem, texto. */
  DOCUMENT: {
    name: 'DOCUMENT',
    mimes: ['application/pdf', ...OFFICE_MIMES, ...IMAGE_MIMES, 'text/plain', 'text/csv'],
    maxBytes: 5 * MB,
    maxDimension: 4000,
  },
} as const satisfies Record<string, FilePolicy>;

export type FilePolicyName = keyof typeof FILE_POLICIES;
