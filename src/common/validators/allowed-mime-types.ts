// ─── Allowlist de MIME types e limites de tamanho para metadados de ficheiro ──
//
// Estes valores descrevem ficheiros já armazenados externamente (ver
// is-allowed-file-url.validator.ts) — o backend nunca recebe os bytes.
// Ainda assim, mimeType/fileSize/fileName são persistidos e devolvidos pela
// API, por isso ficam sujeitos a uma allowlist (em vez de blocklist) para que
// nenhum tipo executável/script passe por omissão, e a limites de tamanho
// para não gravar valores sem sentido (ex: fileSize negativo ou absurdo).

export const ALLOWED_MIME_TYPES = [
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Imagens
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  // Média (biblioteca digital / materiais de curso)
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
] as const;

export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
export const MAX_FILE_SIZE_KB = MAX_FILE_SIZE_BYTES / 1024;
export const MAX_FILE_NAME_LENGTH = 255;
