// src/common/validators/is-url-or-inline-file.decorator.ts
// Campo que aceita uma ligação (qualquer string não vazia, como antes) OU um
// ficheiro enviado inline como data URL base64 (`data:<mime>;base64,…`) —
// mesmo padrão dos PDFs de lição/documentos e do avatar (não há multipart
// neste backend). O data URL é validado: MIME na allowlist e tamanho decodificado
// até `maxBytes`. O tamanho em base64 também tem de caber no parser JSON (8 MB).
import { registerDecorator, ValidationOptions } from 'class-validator';
import { ALLOWED_MIME_TYPES } from './allowed-mime-types';

const DATA_URL_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

export const MAX_INLINE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export function inlineFileProblem(value: string, maxBytes: number): string | null {
  const m = DATA_URL_RE.exec(value);
  if (!m) return 'ficheiro inválido (esperado data URL base64)';
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(m[1])) {
    return `tipo de ficheiro não permitido (${m[1]})`;
  }
  const b64 = m[2];
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((b64.length * 3) / 4) - padding;
  if (bytes > maxBytes) {
    return `o ficheiro excede ${Math.round(maxBytes / (1024 * 1024))} MB`;
  }
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
          if (!value.startsWith('data:')) return true;
          return inlineFileProblem(value, maxBytes) === null;
        },
        defaultMessage(args): string {
          const v = args?.value;
          const problem =
            typeof v === 'string' && v.startsWith('data:') ? inlineFileProblem(v, maxBytes) : null;
          return `${propertyName}: ${problem ?? 'deve ser uma ligação ou um ficheiro (máx. 5 MB)'}`;
        },
      },
    });
  };
}
