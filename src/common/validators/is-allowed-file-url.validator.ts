import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { FilePolicy } from '../files/file-policies';
import { inspectInlineFile } from '../files/inspect-inline-file';
import { safeFileUrlProblem } from './safe-file-url';

export interface AllowedFileUrlExtras {
  /**
   * Aceita também um ficheiro inline (data URL base64): MIME na política, tamanho em bytes e
   * conteúdo real validado pelos bytes (`inspectInlineFile`): tipo, estrutura, conteúdo activo.
   */
  inline?: FilePolicy;
}

/** Motivo da rejeição de um data URL pela política, ou `null`. */
function inlineProblem(value: string, policy: FilePolicy, report = true): string | null {
  const r = inspectInlineFile(value, policy, { report });
  return r.ok === false ? r.error : null;
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
            return `${args.property}: ${inlineProblem(v, extras.inline, false)} Em alternativa, use uma URL HTTPS.`;
          }
          const problem = safeFileUrlProblem(v, { allowedHosts: allowedHosts() });
          return `${args.property} ${problem ?? 'é inválido'}`;
        },
      },
    });
  };
}
