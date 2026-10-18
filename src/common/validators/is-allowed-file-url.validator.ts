import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

const PDF_DATA_URL_PREFIX = 'data:application/pdf;base64,';
const IMAGE_DATA_URL_PREFIXES = [
  'data:image/jpeg;base64,',
  'data:image/png;base64,',
  'data:image/webp;base64,',
];
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export interface AllowedFileUrlExtras {
  /**
   * Aceita também um PDF inline (`data:application/pdf;base64,…`) — mesmo
   * padrão das lições PDF/avatar. Valor = comprimento máximo da string
   * completa (o limite de tamanho do ficheiro, em base64).
   */
  allowPdfDataUrl?: number;
  /** Aceita também imagens inline (JPEG/PNG/WebP) em data URL, com o mesmo
   *  limite de comprimento de `allowPdfDataUrl` (ou próprio se definido). */
  allowImageDataUrl?: number;
}

function isPdfDataUrl(value: string, maxLength: number): boolean {
  if (value.length > maxLength || !value.startsWith(PDF_DATA_URL_PREFIX)) return false;
  return BASE64_RE.test(value.slice(PDF_DATA_URL_PREFIX.length));
}

function isImageDataUrl(value: string, maxLength: number): boolean {
  if (value.length > maxLength) return false;
  const prefix = IMAGE_DATA_URL_PREFIXES.find(p => value.startsWith(p));
  return !!prefix && BASE64_RE.test(value.slice(prefix.length));
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
          if (extras?.allowPdfDataUrl && isPdfDataUrl(value, extras.allowPdfDataUrl)) return true;
          if (extras?.allowImageDataUrl && isImageDataUrl(value, extras.allowImageDataUrl))
            return true;
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
          if ((extras?.allowPdfDataUrl || extras?.allowImageDataUrl) && v?.startsWith?.('data:')) {
            return `${args.property} deve ser um PDF ou imagem válidos dentro do tamanho máximo, ou uma URL HTTPS`;
          }
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
