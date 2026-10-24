// src/common/files/is-file-size-within-limit.decorator.ts
// `fileSize` declarado (ficheiros guardados fora, cujos bytes o backend nunca vê): o teto depende
// do MIME do próprio DTO em vez de um único valor para tudo. Sem MIME usa o teto por omissão.
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { formatLimit } from './data-url';
import { maxExternalBytesFor } from './file-policies';

/** @param mimeField nome da propriedade irmã com o MIME (por omissão `mimeType`). */
export function IsFileSizeWithinLimit(mimeField = 'mimeType', options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    const limitFor = (args: ValidationArguments): number =>
      maxExternalBytesFor(
        (args.object as Record<string, unknown>)[mimeField] as string | undefined,
      );
    registerDecorator({
      name: 'isFileSizeWithinLimit',
      target: object.constructor,
      propertyName,
      constraints: [mimeField],
      options,
      validator: {
        validate: (value: unknown, args: ValidationArguments) =>
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= 1 &&
          value <= limitFor(args),
        defaultMessage: args =>
          `${args?.property} excede o máximo de ${formatLimit(limitFor(args))} para este tipo de ficheiro`,
      },
    });
  };
}
