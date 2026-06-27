# Spec — Cache Redis dos dashboards org-wide (item 3b)

> Data: 2026-06-27
> Branch: `chore/code-review-improvements`
> Origem: item 3 do code review (escalabilidade). Fatia **3b** (cache). O **3a**
> (offload de auditoria/notificações) já está feito no PR #7.

## Contexto e problema

Os dashboards compostos org-wide recalculam ~12 consultas a cada visita. Com
~6000 funcionários e muitos acessos, isto soma latência e carga repetida na BD.
Cachear o resultado por um curto período corta a maioria desse trabalho.

Infra (já confirmada pelo 3a): Redis-compatível **Memurai** em `127.0.0.1:6379`;
`ioredis@5.10` instalado. `cache-manager` NÃO está instalado.

Decisões do utilizador (brainstorming):
- **Âmbito:** só os 3 dashboards compostos org-wide.
- **Mecanismo:** `CacheService` próprio sobre `ioredis` (sem deps novas), com flag
  `CACHE_ENABLED` e fallback gracioso — espelha os padrões do 3a.
- **Invalidação:** só TTL curto (sem invalidação em escrita nem refresh manual).

## Objetivo

Os 3 dashboards org-wide passam a servir de cache Redis (TTL 90 s), recalculando
só quando a cache expira/falha, sem alterar a lógica nem o formato da resposta, e
sem quebrar nada se o Redis estiver em baixo ou desligado.

## Design

### 1. `CacheService` + `CacheModule`

- `src/cache/cache.module.ts` (**`@Global`**): provê um cliente `ioredis` (ligação
  por env, reusa `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` do 3a) e o
  `CacheService`. Global → os serviços de dashboard injetam-no sem importar o módulo.
- `src/cache/cache.service.ts`:
  ```ts
  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    if (!this.cacheEnabled) return compute();
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (e) {
      this.logger.warn(`cache get falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
    const value = await compute();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e) {
      this.logger.warn(`cache set falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return value;
  }
  ```
- `cacheEnabled` lê `CACHE_ENABLED` (default `'true'`; `'false'` → calcula sempre).
- Env nova: `CACHE_ENABLED=true` em `.env`/`.env.example`.
- Resiliência: erro no get OU set → loga (não engole) e calcula na mesma. O
  dashboard nunca quebra por causa da cache.
- Lifecycle: `onModuleDestroy()` → `redis.quit()`.
- `CacheModule` registado no `AppModule`.

### 2. Dashboards, chaves e TTL

`DASHBOARD_CACHE_TTL = 90` (constante única, segundos). Envolver o corpo existente:

| Método | Ficheiro | Chave |
|---|---|---|
| `getExecutiveDashboard()` | `src/dashboard/dashboard.service.ts` | `dashboard:executive` |
| `getFullRhDashboard()` | `src/dashboard-rh/dashboard-rh.service.ts` | `dashboard:rh:full` |
| `getExecutiveSummary()` | `src/dashboard-institutional/dashboard-institutional.service.ts` | `dashboard:institutional:executive-summary` |

Padrão (corpo intacto dentro do callback):
```ts
async getExecutiveDashboard() {
  return this.cache.getOrSet('dashboard:executive', DASHBOARD_CACHE_TTL, async () => {
    // ...corpo existente...
  });
}
```
Cada serviço injeta `private readonly cache: CacheService` no construtor. Só estes
3 métodos mudam.

### 3. Testes (TDD, comportamento)

- `CacheService`: hit (devolve parseado, não calcula); miss (calcula + `set` com
  `'EX', ttl`); `CACHE_ENABLED=false` (calcula, não toca no redis); Redis em baixo
  (get/set lançam → calcula na mesma).
- Dashboards: mock de `CacheService` cujo `getOrSet` executa o `compute` recebido;
  assere chave certa + TTL `90`; resultado preservado; specs existentes sem regressão.
- Verificação final: specs verdes + `tsc --noEmit` limpo. Mocks → corre sem Redis.

## Critério de sucesso

1. Os 3 dashboards servem de cache com TTL 90 s quando `CACHE_ENABLED=true`.
2. `CACHE_ENABLED=false` ou Redis em baixo → calculam diretamente (sem quebrar).
3. Formato das respostas inalterado.
4. Specs verdes + `tsc --noEmit` limpo.

## Fora de âmbito

- Invalidação em escrita e endpoint de refresh manual (escolhido só-TTL).
- Dashboards por-utilizador e por-departamento, widgets, snapshots.
- Cache de quaisquer outros endpoints.
- `@nestjs/cache-manager` (usa-se `ioredis` direto).
