import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { FilePolicy } from '../files/file-policies';
import { inspectInlineFile } from '../files/inspect-inline-file';
import { inlineVerdict, recallReason, remoteFileVerdict } from './inline-verdict';
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
        validate(value: unknown, args: ValidationArguments): boolean | Promise<boolean> {
          if (typeof value !== 'string' || !value) return false;
          if (extras?.inline && value.startsWith('data:')) {
            return inlineVerdict(value, extras.inline, args.object, args.property);
          }
          if (safeFileUrlProblem(value, { allowedHosts: allowedHosts() }) !== null) return false;
          // Ficheiro no storage: com REMOTE_FILE_VERIFY=true é descarregado e verificado.
          return remoteFileVerdict(
            value,
            (args.object as { mimeType?: unknown }).mimeType,
            args.object,
            args.property,
          );
        },
        defaultMessage(args: ValidationArguments): string {
          const v = args.value as string;
          if (extras?.inline && v?.startsWith?.('data:')) {
            const reason = recallReason(args.object, args.property);
            return `${args.property}: ${reason ?? inlineProblem(v, extras.inline, false)} Em alternativa, use uma URL HTTPS.`;
          }
          const problem = safeFileUrlProblem(v, { allowedHosts: allowedHosts() });
          if (!problem) {
            const reason = recallReason(args.object, args.property);
            if (reason) return `${args.property}: ${reason}`;
          }
          return `${args.property} ${problem ?? 'é inválido'}`;
        },
      },
    });
  };
}
