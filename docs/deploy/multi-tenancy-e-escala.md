# Multi-tenancy, escala horizontal, filas e cache — auditoria (2026-10-27)

Auditoria dos princípios de arquitectura SaaS contra o código real. Estado por ponto e decisões.

| Princípio | Estado | Evidência / decisão |
|---|---|---|
| Modelo de multi-tenancy definido | ⚠️ decidido aqui (ver ADR) | Hoje a plataforma é **single-tenant** (uma empresa, ~6000 utilizadores). `TenantConfig` existe e ~15 modelos têm `tenantId`, mas o fluxo de auth nunca o popula: `resolveDefaultTenantId()` devolve sempre o tenant `DEFAULT` (`src/common/helpers/tenant.helper.ts`). |
| Isolamento por cliente na camada de dados | ⚠️ parcial | RLS Postgres activo por **utilizador** (`ops/db/rls`, `RLS_ENABLED`), não por tenant. Protege contra IDOR e credenciais fora da API; **não** separa clientes diferentes. Só é problema quando houver um 2.º cliente (ver ADR). |
| Serviços stateless | ✅ | Sem sessões em memória nem ficheiros em disco local; JWT + Redis (revogação de sessão, cache, filas). Já corre `app ×2` (`ha-and-spof.md`). Os `Map` em memória são só single-flight/caches com TTL, recuperáveis. |
| Tarefas únicas com várias réplicas | ✅ corrigido | Os ~30 `@Cron` dispararam uma vez **por réplica** (emails, lembretes e alertas duplicados). `ClusterCronLockService` embrulha cada CronJob com `SET NX PX 30000` em Redis (`src/common/scheduling/`); `CLUSTER_CRON_LOCK=false` desliga; Redis em baixo → executa sem lock. |
| Filas e tarefas assíncronas | ✅ | Bull sobre Redis (`src/queue`): processors de email, notificações, webhooks e auditoria; shutdown hooks activos. |
| Cache | ✅ | `CacheService` (Redis, TTL, single-flight anti-stampede, métricas Prometheus, `CACHE_ENABLED`); `maxmemory` + `volatile-lru` para não despejar chaves do Bull. |
| Monólito bem organizado | ✅ | Monólito modular NestJS, fases A–J concluídas (um serviço canónico por domínio). Não dividir em microserviços antes dos gatilhos de `arquitetura-producao.md`. |

## ADR — modelo de multi-tenancy

**Decisão:** BD partilhada com `tenantId` + RLS por tenant (não schemas nem BDs dedicadas).

**Porquê:** um só Postgres/pool/migração para operar; RLS já está montado e testado com `set_config` por transacção (compatível com PgBouncer). Schemas por cliente multiplicam migrações e pools; BDs dedicadas só se um cliente exigir isolamento contratual/residência de dados — tratar como excepção (instância própria da stack).

**Estado actual:** não activar para um 2.º cliente sem os passos abaixo; com um só cliente, o custo não compensa.

**Passos quando houver o 2.º cliente (por ordem):**
1. `User.tenantId` obrigatório; `JwtStrategy` coloca o `tenantId` no contexto RLS (`src/common/rls/rls-context.ts`) em vez de `resolveDefaultTenantId`.
2. `tenantId` + índice `(tenantId, …)` em todos os modelos de negócio (hoje só ~15) via migration com backfill para o tenant `DEFAULT`.
3. `set_config('app.tenant_id', …)` em `src/prisma/rls-pool.ts` e `app.tenant_id()` + policy `tenantId = app.tenant_id()` em `ops/db/rls/01_rls_harden.sql` — **também para roles privilegiadas** (ADMIN/RH de um cliente não vê outro).
4. Chaves de cache, filas e ficheiros prefixadas pelo tenant.
5. Suite de integração com 2 tenants a provar que nenhuma rota cruza dados.
