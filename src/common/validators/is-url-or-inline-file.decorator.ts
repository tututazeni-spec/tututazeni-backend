// src/common/validators/is-url-or-inline-file.decorator.ts
// Campo que aceita uma ligação https externa (sem credenciais nem hosts internos) OU um
// ficheiro enviado inline como data URL base64 (`data:<mime>;base64,…`) —
// mesmo padrão dos PDFs de lição/documentos e do avatar (não há multipart
// neste backend). O data URL é validado: MIME na allowlist e tamanho decodificado
// até `maxBytes`. O tamanho em base64 também tem de caber no parser JSON (8 MB).
import { registerDecorator, ValidationOptions } from 'class-validator';
import { ALLOWED_MIME_TYPES } from './allowed-mime-types';
import { safeFileUrlProblem } from './safe-file-url';

// Só o cabeçalho passa por regex. O payload base64 pode ter milhões de caracteres e um regex
// com captura sobre ele rebentava com "Maximum call stack size exceeded" no CI.
const DATA_URL_HEADER_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,/;
const HEADER_MAX_CHARS = 128;

export const MAX_INLINE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const isBase64Char = (c: number): boolean =>
  (c >= 65 && c <= 90) || // A-Z
  (c >= 97 && c <= 122) || // a-z
  (c >= 48 && c <= 57) || // 0-9
  c === 43 || // +
  c === 47; // /

/** Mesma regra de `[A-Za-z0-9+/]+={0,2}`, sem regex: o payload nunca é copiado nem recursivo. */
function base64PayloadLength(
  value: string,
  start: number,
): { length: number; padding: number } | null {
  let end = value.length;
  let padding = 0;
  while (padding < 2 && end > start && value.charCodeAt(end - 1) === 61) {
    end--;
    padding++;
  }
  if (end === start) return null; // `+` exige pelo menos um carácter
  for (let i = start; i < end; i++) {
    if (!isBase64Char(value.charCodeAt(i))) return null;
  }
  return { length: value.length - start, padding };
}

export function inlineFileProblem(value: string, maxBytes: number): string | null {
  const invalid = 'ficheiro inválido (esperado data URL base64)';
  const m = DATA_URL_HEADER_RE.exec(value.slice(0, HEADER_MAX_CHARS));
  if (!m) return invalid;
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(m[1])) {
    return `tipo de ficheiro não permitido (${m[1]})`;
  }
  const tooBig = `o ficheiro excede ${Math.round(maxBytes / (1024 * 1024))} MB`;
  // Rejeita pelo tamanho antes de percorrer o payload (o padding tira no máximo 2 bytes).
  if (Math.floor(((value.length - m[0].length) * 3) / 4) - 2 > maxBytes) return tooBig;
  const payload = base64PayloadLength(value, m[0].length);
  if (!payload) return invalid;
  const bytes = Math.floor((payload.length * 3) / 4) - payload.padding;
  if (bytes > maxBytes) return tooBig;
  return null;
}

export function IsUrlOrInlineFile(options?: ValidationOptions & { maxBytes?: number }) {
  const maxBytes = options?.maxBytes ?? MAX_INLINE_FILE_BYTES;
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUrlOrInlineFile',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !value.trim()) return false;
          if (!value.startsWith('data:')) return safeFileUrlProblem(value) === null;
          return inlineFileProblem(value, maxBytes) === null;
        },
        defaultMessage(args): string {
          const v = args?.value;
          const problem =
            typeof v === 'string'
              ? v.startsWith('data:')
                ? inlineFileProblem(v, maxBytes)
                : safeFileUrlProblem(v)
              : null;
          return `${propertyName}: ${problem ?? 'deve ser uma ligação ou um ficheiro (máx. 5 MB)'}`;
        },
      },
    });
  };
}
