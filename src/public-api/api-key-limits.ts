// Lógica pura da API pública por chave: scopes, IPs permitidos e janela de pedidos.

export type ApiScope = 'read' | 'write' | 'admin';

/** admin ⊇ write ⊇ read. */
export function scopeAllows(granted: readonly string[], required: ApiScope): boolean {
  if (granted.includes('admin')) return true;
  if (required === 'write') return granted.includes('write');
  if (required === 'read') return granted.includes('read') || granted.includes('write');
  return false;
}

export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '';
  return ip.replace(/^::ffff:/, '');
}

/** Lista vazia = qualquer IP. */
export function ipAllowed(
  allowed: readonly string[] | undefined,
  ip: string | undefined | null,
): boolean {
  if (!allowed || allowed.length === 0) return true;
  const current = normalizeIp(ip);
  return allowed.map(normalizeIp).includes(current);
}

export interface WindowDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** segundos até a janela actual terminar */
  resetSeconds: number;
}

export const WINDOW_MS = 60_000;

/** `count` já inclui o pedido actual. */
export function decideWindow(count: number, limit: number, nowMs: number): WindowDecision {
  const resetSeconds = Math.max(1, Math.ceil((WINDOW_MS - (nowMs % WINDOW_MS)) / 1000));
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetSeconds,
  };
}
