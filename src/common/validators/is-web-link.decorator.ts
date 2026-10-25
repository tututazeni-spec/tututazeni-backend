// Ligações externas que o frontend renderiza em <a href> (reunião, vídeo, LinkedIn, contrato,
// evidência…). Só http(s): `javascript:`, `data:` e `vbscript:` num href são XSS armazenado
// (a CSP bloqueia `javascript:`, mas é defesa em profundidade, não validação).
// Diferente de @IsHttpsUrl (integrações em produção só https) e de @IsAllowedFileUrl (ficheiros em
// storage com allowlist): aqui o destino é uma página de terceiros, por isso qualquer host http(s).
import { isURL, registerDecorator, ValidationOptions } from 'class-validator';

const MAX_LENGTH = 2048;

export interface WebLinkOptions {
  /** Aceita também caminhos relativos da própria app (`/rota`), nunca `//host` (protocol-relative). */
  allowRelative?: boolean;
}

export function isWebLink(value: unknown, isProd: boolean, opts: WebLinkOptions = {}): boolean {
  // '' = campo limpo pelo utilizador; o frontend só renderiza o link quando não é vazio.
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > MAX_LENGTH) return false;
  // Whitespace/controlo (ex.: "java\tscript:") é como se disfarça o esquema.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f]/.test(value)) return false;
  if (opts.allowRelative && value.startsWith('/')) {
    return !value.startsWith('//') && !value.includes('\\');
  }
  return isURL(value, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: isProd,
  });
}

export function IsWebLink(webOptions?: WebLinkOptions, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isWebLink',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          isWebLink(value, process.env.NODE_ENV === 'production', webOptions),
        defaultMessage: () =>
          webOptions?.allowRelative
            ? '$property tem de ser um URL http(s):// ou um caminho interno (/…)'
            : '$property tem de ser um URL http:// ou https:// válido',
      },
    });
  };
}
