// Política de senha (A2-5): >=10 chars, minúscula + maiúscula + dígito.
// Aplicar a registo/reset/change — NUNCA ao login (aí só se validam credenciais).
import { registerDecorator, ValidationOptions } from 'class-validator';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;

export function IsStrongPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && STRONG.test(value),
        defaultMessage: () =>
          'A senha deve ter pelo menos 10 caracteres, incluindo minúscula, maiúscula e dígito',
      },
    });
  };
}
