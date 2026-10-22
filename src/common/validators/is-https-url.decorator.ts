// URLs de integrações externas (webhooks, ERP, CDN, IdP): em produção só https://
// (auditoria A-1 — um webhook em http envia dados em claro e facilita SSRF para
// serviços internos). Fora de produção aceita http:// para facilitar dev local.
import { isURL, registerDecorator, ValidationOptions } from 'class-validator';

export function isAllowedIntegrationUrl(value: unknown, isProd: boolean): boolean {
  if (typeof value !== 'string') return false;
  return isURL(value, {
    protocols: isProd ? ['https'] : ['http', 'https'],
    require_protocol: true,
    require_tld: isProd,
  });
}

export function IsHttpsUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHttpsUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          isAllowedIntegrationUrl(value, process.env.NODE_ENV === 'production'),
        defaultMessage: () => '$property tem de ser um URL https:// válido',
      },
    });
  };
}
