import { Logger } from '@nestjs/common';

/**
 * Handler para `.catch()` de operações auxiliares que não devem rebentar o fluxo
 * principal mas cuja falha tem de ficar visível. Substitui `.catch(() => null)`
 * (que engolia o erro sem rasto): regista com contexto e devolve o `fallback`.
 */
export function swallow<T>(
  context: string,
  message: string,
  fallback: T,
  level: 'warn' | 'error' = 'warn',
): (err: unknown) => T {
  return (err: unknown): T => {
    new Logger(context)[level]({ err }, message);
    return fallback;
  };
}
