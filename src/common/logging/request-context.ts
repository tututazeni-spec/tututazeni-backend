import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  reqId?: string;
  userId?: number | string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Estabelece o contexto para toda a cadeia assíncrona do pedido (middleware → guards → interceptors → filters). */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Lê o contexto do pedido corrente. Fora de um pedido HTTP (jobs, bootstrap) devolve {}. */
export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}

/** Regista o userId assim que a autenticação o resolve (mutação do store activo, não substituição). */
export function setRequestUserId(userId: number | string | null | undefined): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId ?? null;
}
