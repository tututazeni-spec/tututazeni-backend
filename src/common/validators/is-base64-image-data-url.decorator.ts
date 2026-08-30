// src/common/validators/is-base64-image-data-url.decorator.ts
// Valida uma foto de perfil enviada como data URL base64 (upload self-service
// de avatar). Restringe a png/jpeg/jpg/webp — svg fica de fora de propósito
// (um SVG pode conter <script>, e o avatar é sempre renderizado em <img src>).
// O limite de tamanho vive no @MaxLength do DTO, não aqui.
import { registerDecorator, ValidationOptions } from 'class-validator';

const BASE64_IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function IsBase64ImageDataUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBase64ImageDataUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && BASE64_IMAGE_DATA_URL.test(value),
        defaultMessage: () =>
          'avatarUrl deve ser uma data URL de imagem (png, jpeg ou webp) em base64',
      },
    });
  };
}
