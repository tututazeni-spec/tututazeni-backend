import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export function IsAllowedFileUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllowedFileUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, _args: ValidationArguments): boolean {
          if (typeof value !== 'string' || !value) return false;
          let url: URL;
          try {
            url = new URL(value);
          } catch {
            return false;
          }
          if (url.protocol !== 'https:') return false;
          const raw = process.env.ALLOWED_FILE_HOST ?? '';
          const allowed = raw
            .split(',')
            .map(h => h.trim())
            .filter(Boolean);
          if (allowed.length === 0) return true;
          return allowed.includes(url.hostname);
        },
        defaultMessage(args: ValidationArguments): string {
          const v = args.value as string;
          let url: URL | null = null;
          try {
            url = new URL(v);
          } catch {
            /* not a url */
          }
          if (!url) return `${args.property} deve ser uma URL válida`;
          if (url.protocol !== 'https:') return `${args.property} deve usar HTTPS`;
          return `${args.property} aponta para um domínio não autorizado`;
        },
      },
    });
  };
}
