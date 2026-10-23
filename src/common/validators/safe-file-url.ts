// src/common/validators/safe-file-url.ts
// Regras base para qualquer ligação externa a um ficheiro: só https, sem credenciais
// embutidas e sem hosts internos (loopback, redes privadas, link-local). Não resolve DNS:
// protege contra literais óbvios, não contra um domínio público que aponte para um IP interno.
import { registerDecorator, ValidationOptions } from 'class-validator';

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.intranet'];

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / metadados cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast / reservado
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::' || h === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // O parser WHATWG normaliza ::ffff:127.0.0.1 para ::ffff:7f00:1.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return /^f[cd]/.test(h) || /^fe[89ab]/.test(h); // fc00::/7 e fe80::/10
}

export function isInternalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost') return true;
  if (BLOCKED_HOST_SUFFIXES.some(s => h.endsWith(s))) return true;
  // Literais numéricos exóticos (0x7f.1, 2130706433) que o parser WHATWG normaliza para a.b.c.d
  // já chegam aqui normalizados; o que sobra sem pontos é inteiro puro.
  if (/^\d+$/.test(h)) return true;
  return isPrivateIPv4(h) || isPrivateIPv6(h);
}

export interface SafeUrlOptions {
  /** Se definido e não vazio, o hostname tem de constar da lista. */
  allowedHosts?: string[];
}

/** `null` se a ligação é aceitável; caso contrário o motivo (para a mensagem de erro). */
export function safeFileUrlProblem(value: unknown, opts: SafeUrlOptions = {}): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'deve ser uma URL válida';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'deve ser uma URL válida';
  }
  if (url.protocol !== 'https:') return 'deve usar HTTPS';
  if (url.username || url.password) return 'não pode conter credenciais na URL';
  if (isInternalHostname(url.hostname)) return 'aponta para um endereço interno não permitido';
  if (opts.allowedHosts?.length && !opts.allowedHosts.includes(url.hostname)) {
    return 'aponta para um domínio não autorizado';
  }
  return null;
}

export function IsSafeFileUrl(options?: ValidationOptions & SafeUrlOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeFileUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => safeFileUrlProblem(value, options) === null,
        defaultMessage: args =>
          `${args?.property}: ${safeFileUrlProblem(args?.value, options) ?? 'URL inválida'}`,
      },
    });
  };
}
