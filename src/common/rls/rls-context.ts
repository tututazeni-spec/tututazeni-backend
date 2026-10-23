import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de Row Level Security do pedido corrente (ver ops/db/rls/README.md).
 * O RlsPool lê-o em cada transacção e escreve-o em `app.user_id` / `app.privileged`.
 */
export interface RlsStore {
  uid?: number;
  privileged: boolean;
}

const storage = new AsyncLocalStorage<RlsStore>();

/** Roles que passam pelas verificações de RBAC/ownership da camada de serviço e precisam de ver dados de terceiros. */
export function privilegedRoleCodes(): Set<string> {
  const raw =
    process.env.RLS_PRIVILEGED_ROLES ?? 'ADMIN,RH,DIRECTOR,GESTOR,LIDER,AUDITOR,INSTRUCTOR';
  return new Set(
    raw
      .split(',')
      .map(r => r.trim().toUpperCase())
      .filter(Boolean),
  );
}

/** Pedido HTTP: começa sem privilégios e sem utilizador (deny-by-default) até o guard o resolver. */
export function runWithRls<T>(fn: () => T, store: RlsStore = { privileged: false }): T {
  return storage.run(store, fn);
}

/**
 * Caminhos de confiança (login, refresh, carregamento do utilizador no JWT, rotas @Public).
 * As queries Prisma são lazy (só correm no await): o await TEM de acontecer dentro do
 * contexto, por isso fn é sempre aguardada aqui e nunca devolvida por executar.
 */
export function runAsSystem<T>(fn: () => T | PromiseLike<T>): Promise<T> {
  return storage.run({ privileged: true }, async () => await fn());
}

/** Chamado pelo JwtAuthGuard depois de validar o token. Muta o store activo. */
export function setRlsUser(userId: number, roleCode?: string | null): void {
  const store = storage.getStore();
  if (!store) return;
  store.uid = userId;
  store.privileged = !!roleCode && privilegedRoleCodes().has(roleCode.toUpperCase());
}

/** Rotas @Public fazem a sua própria validação e precisam de aceder à BD sem utilizador. */
export function setRlsPrivileged(privileged: boolean): void {
  const store = storage.getStore();
  if (store) store.privileged = privileged;
}

/**
 * Definições a aplicar à transacção. Fora de um pedido HTTP (cron, filas Bull, arranque)
 * não há store: é código do próprio processo, logo privilegiado.
 */
export function currentRlsSettings(): { userId: string; privileged: boolean } {
  const store = storage.getStore();
  if (!store) return { userId: '', privileged: true };
  return {
    userId: store.uid !== undefined && Number.isInteger(store.uid) ? String(store.uid) : '',
    privileged: store.privileged,
  };
}
