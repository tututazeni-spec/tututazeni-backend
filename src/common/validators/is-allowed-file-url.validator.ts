import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { FilePolicy } from '../files/file-policies';
import { parseDataUrl } from '../files/data-url';
import { safeFileUrlProblem } from './safe-file-url';

export interface AllowedFileUrlExtras {
  /**
   * Aceita também um ficheiro inline (data URL base64) cujo MIME declarado conste da política e
   * cujo tamanho descodificado não exceda `maxBytes`. A inspecção do conteúdo vive em
   * `src/common/files` (inspectInlineFile).
   */
  inline?: FilePolicy;
}

/** Motivo da rejeição de um data URL pela política (MIME na lista, tamanho em bytes), ou `null`. */
function inlineProblem(value: string, policy: FilePolicy): string | null {
  const parsed = parseDataUrl(value, policy.maxBytes);
  if (parsed.ok === false) return parsed.error;
  if (!policy.mimes.includes(parsed.declaredMime)) {
    return `tipo de ficheiro não permitido (${parsed.declaredMime})`;
  }
  return null;
}

function allowedHosts(): string[] {
  return (process.env.ALLOWED_FILE_HOST ?? '')
    .split(',')
    .map(h => h.trim())
    .filter(Boolean);
}

export function IsAllowedFileUrl(options?: ValidationOptions, extras?: AllowedFileUrlExtras) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllowedFileUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, _args: ValidationArguments): boolean {
          if (typeof value !== 'string' || !value) return false;
          if (extras?.inline && value.startsWith('data:')) {
            return inlineProblem(value, extras.inline) === null;
          }
          return safeFileUrlProblem(value, { allowedHosts: allowedHosts() }) === null;
        },
        defaultMessage(args: ValidationArguments): string {
          const v = args.value as string;
          if (extras?.inline && v?.startsWith?.('data:')) {
            return `${args.property}: ${inlineProblem(v, extras.inline)} Em alternativa, use uma URL HTTPS.`;
          }
          const problem = safeFileUrlProblem(v, { allowedHosts: allowedHosts() });
          return `${args.property} ${problem ?? 'é inválido'}`;
        },
      },
    });
  };
}
