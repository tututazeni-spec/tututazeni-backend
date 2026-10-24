// src/common/validators/is-url-or-inline-file.decorator.ts
// Campo que aceita uma ligação https externa (sem credenciais nem hosts internos) OU um
// ficheiro enviado inline como data URL base64 (`data:<mime>;base64,…`) —
// mesmo padrão dos PDFs de lição/documentos e do avatar (não há multipart
// neste backend). O data URL é validado: MIME na allowlist e tamanho decodificado
// até `maxBytes`. O tamanho em base64 também tem de caber no parser JSON (8 MB).
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { inlineVerdict, recallReason } from './inline-verdict';
import { ALLOWED_MIME_TYPES } from './allowed-mime-types';
import { base64PayloadLength, formatLimit, maxDecodedBytes } from '../files/data-url';
import { FILE_POLICIES, FilePolicy } from '../files/file-policies';
import { inspectInlineFile } from '../files/inspect-inline-file';
import { safeFileUrlProblem } from './safe-file-url';

// Só o cabeçalho passa por regex (ver parseDataUrl): o payload base64 pode ter milhões de
// caracteres e um regex com captura sobre ele rebentava com "Maximum call stack size exceeded".
const DATA_URL_HEADER_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,/;
const HEADER_MAX_CHARS = 128;

/** Limite por omissão do ficheiro inline: o do documento genérico (5 MB). */
export const DEFAULT_INLINE_FILE_BYTES = FILE_POLICIES.DOCUMENT.maxBytes;

export function inlineFileProblem(value: string, maxBytes: number): string | null {
  const invalid = 'ficheiro inválido (esperado data URL base64)';
  const m = DATA_URL_HEADER_RE.exec(value.slice(0, HEADER_MAX_CHARS));
  if (!m) return invalid;
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(m[1])) {
    return `tipo de ficheiro não permitido (${m[1]})`;
  }
  const tooBig = `o ficheiro excede ${formatLimit(maxBytes)}`;
  // Rejeita pelo tamanho antes de percorrer o payload (o padding tira no máximo 2 bytes).
  if (maxDecodedBytes(value.length - m[0].length) - 2 > maxBytes) return tooBig;
  const payload = base64PayloadLength(value, m[0].length);
  if (!payload) return invalid;
  const bytes = maxDecodedBytes(payload.length) - payload.padding;
  if (bytes > maxBytes) return tooBig;
  return null;
}

export function IsUrlOrInlineFile(
  options?: ValidationOptions & {
    maxBytes?: number;
    /** Se definida, o ficheiro inline é inspeccionado pelos bytes (tipo real, estrutura) com esta
     *  política; `maxBytes` passa a ser o da política. Sem ela, só MIME declarado + tamanho. */
    policy?: FilePolicy;
  },
) {
  const policy = options?.policy;
  const maxBytes = policy?.maxBytes ?? options?.maxBytes ?? DEFAULT_INLINE_FILE_BYTES;
  const inlineProblemOf = (v: string, report = true): string | null => {
    if (policy) {
      const r = inspectInlineFile(v, policy, { report });
      return r.ok === false ? r.error : null;
    }
    return inlineFileProblem(v, maxBytes);
  };
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUrlOrInlineFile',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean | Promise<boolean> {
          if (typeof value !== 'string' || !value.trim()) return false;
          if (!value.startsWith('data:')) return safeFileUrlProblem(value) === null;
          if (policy) return inlineVerdict(value, policy, args.object, propertyName);
          return inlineProblemOf(value) === null;
        },
        defaultMessage(args): string {
          const v = args?.value;
          const problem =
            typeof v === 'string'
              ? v.startsWith('data:')
                ? (recallReason(args?.object, propertyName) ?? inlineProblemOf(v, false))
                : safeFileUrlProblem(v)
              : null;
          return `${propertyName}: ${problem ?? `deve ser uma ligação ou um ficheiro (máx. ${formatLimit(maxBytes)})`}`;
        },
      },
    });
  };
}
