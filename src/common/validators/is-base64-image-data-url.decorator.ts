// src/common/validators/is-base64-image-data-url.decorator.ts
// Valida uma imagem enviada como data URL base64 (avatar, capa de plano/PDI). Restringe a
// png/jpeg/webp — svg fica de fora de propósito (pode conter <script>) — e confere os BYTES:
// o conteúdo tem de ser mesmo a imagem declarada, com dimensões e tamanho dentro da política.
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { inlineVerdict, recallReason } from './inline-verdict';
import { FILE_POLICIES, FilePolicy } from '../files/file-policies';
import { inspectInlineFile } from '../files/inspect-inline-file';

/** @param policy por omissão imagem de cartão (512 KB); o avatar usa FILE_POLICIES.AVATAR. */
export function IsBase64ImageDataUrl(
  options?: ValidationOptions,
  policy: FilePolicy = FILE_POLICIES.CARD_IMAGE,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBase64ImageDataUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown, args: ValidationArguments): boolean | Promise<boolean> =>
          typeof value === 'string' && inlineVerdict(value, policy, args.object, propertyName),
        defaultMessage: args => {
          const v = args?.value;
          const reason =
            typeof v === 'string' && v.startsWith('data:')
              ? (recallReason(args?.object, propertyName) ??
                (inspectInlineFile(v, policy, { report: false }) as { error?: string }).error)
              : undefined;
          return `${args?.property} deve ser uma imagem válida (png, jpeg ou webp) em data URL base64${
            reason ? `: ${reason}` : ''
          }`;
        },
      },
    });
  };
}
