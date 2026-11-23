// src/common/helpers/client-ip.ts
// IP real da máquina que fez o pedido (para logs de acesso/auditoria).
//
// - Atrás de proxy (Caddy/Cloudflare/Next): usa CF-Connecting-IP, X-Real-IP ou o
//   1.º X-Forwarded-For — mas só se o salto directo for loopback/rede privada
//   (um cliente externo a falar directamente com a app não pode forjar o IP).
// - Normaliza IPv6 mapeado (::ffff:1.2.3.4 → 1.2.3.4).
// - Pedido da própria máquina (::1 / 127.0.0.1): devolve o IPv4 de rede local
//   da máquina em vez de "::1", que não identifica nada.
import { networkInterfaces } from 'os';
import type { Request } from 'express';

function strip(ip: string): string {
  return ip.trim().replace(/^::ffff:/i, '');
}

export function isLoopback(ip: string): boolean {
  return ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.');
}

function isPrivate(ip: string): boolean {
  return (
    isLoopback(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd][0-9a-f]{2}:/i.test(ip)
  );
}

/** Primeiro IPv4 não-interno da máquina onde a app corre (ou null). */
export function localMachineIp(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

function header(req: Pick<Request, 'headers'>, name: string): string | undefined {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
}

export function getClientIp(
  req: Pick<Request, 'ip' | 'headers' | 'socket'>,
  machineIp: () => string | null = localMachineIp,
): string {
  const hop = strip(req.socket?.remoteAddress ?? req.ip ?? '');
  const forwarded =
    hop === '' || isPrivate(hop)
      ? (header(req, 'cf-connecting-ip') ??
        header(req, 'x-real-ip') ??
        header(req, 'x-forwarded-for')?.split(',')[0])
      : undefined;

  const ip = strip(forwarded ?? req.ip ?? hop);
  if (!ip) return 'unknown';
  if (isLoopback(ip)) return machineIp() ?? ip;
  return ip;
}
