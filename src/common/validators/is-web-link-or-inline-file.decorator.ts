// Campo que aceita um link web (http/https, como @IsWebLink) OU um ficheiro enviado inline como
// data URL base64 (`data:<mime>;base64,…`) com MIME na allowlist e tamanho dentro de `maxBytes`.
// Para conteúdo de lição e média de perguntas, que podem ser um link (YouTube, página) ou um PDF
// inline — onde @IsWebLink partiria o fluxo do ficheiro e @IsString deixava passar `javascript:`.
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isWebLink } from './is-web-link.decorator';
import { DEFAULT_INLINE_FILE_BYTES, inlineFileProblem } from './is-url-or-inline-file.decorator';

export function isWebLinkOrInlineFile(
  value: unknown,
  isProd: boolean,
  maxBytes: number = DEFAULT_INLINE_FILE_BYTES,
): boolean {
  if (typeof value !== 'string') return false;
  if (value.startsWith('data:')) return inlineFileProblem(value, maxBytes) === null;
  return isWebLink(value, isProd);
}

export function IsWebLinkOrInlineFile(
  fileOptions?: { maxBytes?: number },
  options?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isWebLinkOrInlineFile',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          isWebLinkOrInlineFile(
            value,
            process.env.NODE_ENV === 'production',
            fileOptions?.maxBytes,
          ),
        defaultMessage: () =>
          '$property tem de ser um URL http(s):// ou um ficheiro permitido em data URL base64',
      },
    });
  };
}
