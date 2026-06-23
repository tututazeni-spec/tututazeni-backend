# Arquitectura de Base de Dados — INNOVA

> Plano de alta-disponibilidade e escalabilidade (master-slave / read-replicas)
> Autor: revisão DBA sénior · Data: 2026-06-18
> SGBD: PostgreSQL · ORM: Prisma 7.5 (driver adapter `pg`) · App: NestJS

---

## 0. TL;DR (leia primeiro)

O requisito do cliente é **master-slave** (um servidor de escrita + servidores de leitura,
replicação em tempo real, balanceamento e failover automático).

**Decisão tomada:** usar **PostgreSQL gerido** (Supabase / Neon / AWS RDS / Azure Database
for PostgreSQL). Um Postgres gerido **já É uma arquitectura master-slave por baixo do capô**:

| Requisito do cliente | Como o Postgres gerido o cumpre |
|---|---|
| Servidor master (só escrita) | A *primary instance* do provider |
| Servidores slave (só leitura) | *Read replicas* (1 clique para criar) |
| Replicação em tempo real | *Streaming replication* nativa, gerida pelo provider |
| Balanceamento de carga | *Reader endpoint* / routing na aplicação (ver `02-...`) |
| Failover automático | Incluído e operado pelo provider (segundos, sem split-brain) |
| Monitoring de performance | Dashboards do provider + queries em `04-monitoring.sql` |

> **Resultado:** o requisito master-slave fica 100% cumprido, mas **sem você ter de operar
> replicação manual nem failover** — que é a parte perigosa. Mostre a tabela acima ao cliente.

Se houver **obrigação de _on-premise_** (servidor próprio), o setup manual completo
(streaming replication + PgBouncer + HAProxy + Patroni) está em `03-self-managed-replication.md`.

---

## 1. Análise do banco actual (estado real encontrado)

| Item | Realidade |
|---|---|
| SGBD | PostgreSQL (via `@prisma/adapter-pg`) |
| Schema | **299 modelos**, ~7000 linhas, 18 migrações |
| Índices | **437 `@@index` + 58 `@@unique`** — já fortemente indexado |
| PK do `User` | `Int autoincrement` |
| Pool de conexões | `pg.Pool`, `max: 50`, ligação única (`DATABASE_URL`) |
| Slow query log | **Já existe** (`SLOW_QUERY_LOG`, threshold 500ms → ficheiro) |
| Escala | ~6000 funcionários internos (Academia + RH + CRM) |
| Pico medido (load-test) | 600 normal / 3000 stress utilizadores |
| Perfil de carga | **Read-heavy** (listas, dashboards, perfis) com escrita pontual |

### Conclusões da análise
1. **Não há défice de índices** — o schema já tem 437. O gargalo provável **não** é falta de índice.
2. **O perfil read-heavy** é exactamente onde read-replicas ajudam — *se* a leitura saturar.
3. **A esta escala, o ganho nº1 é connection pooling** (PgBouncer / pooler do provider),
   não replicação. 6000 utilizadores internos ≠ 6000 req/s.
4. **Risco principal das réplicas:** *replication lag* → leitura logo após escrita pode não
   ver o dado. Mitigação obrigatória na aplicação (ver `02-...`, secção "read-after-write").

---

## 2. Faseamento (pare no nível que faz sentido)

| Fase | O quê | Resolve | Ficheiro |
|---|---|---|---|
| **F1** | Pooler de conexões + tuning de queries lentas | 90% dos problemas reais de carga | `01`, `04` |
| **F2** | Provisionar Postgres gerido + 1 read replica | Resiliência + failover (requisito cliente) | `01` |
| **F3** | Read/write split na aplicação (Prisma extension) | Tira leitura do master → escala | `02` |
| **F4** | Monitoring contínuo + alertas | Visibilidade | `04` |
| **F5** (opcional) | Self-managed on-prem (Patroni/HAProxy) | Só se _on-premise_ obrigatório | `03` |

---

## 3. Cronograma sugerido

| Semana | Actividade | Risco | Rollback |
|---|---|---|---|
| **1** | Activar pooler + analisar slow query log + afinar top 10 queries | Baixo | Reverter env var |
| **2** | Criar projecto Postgres gerido (staging) + restaurar dump + testar app | Baixo | Continuar no banco antigo |
| **3** | Criar read replica em staging + integrar Prisma read-replicas extension | Médio | Feature flag `USE_REPLICAS=false` |
| **4** | Load-test (reusar `npm run test:load`) contra staging com réplica | Baixo | — |
| **5** | Janela de migração de produção: dump → restore → cutover DNS/env | **Alto** | Plano de rollback DNS (ver `01`) |
| **6** | Monitorização intensiva pós-cutover + ajuste de routing de leitura | Baixo | Desligar réplica no routing |

> Regra de ouro: **nunca** fazer o cutover de produção sem ter feito o mesmo procedimento
> com sucesso em staging na semana anterior.

---

## 4. Índice de ficheiros

- `01-managed-postgres.md` — provisionar primary + replica, migração de dados, cutover, rollback
- `02-app-read-write-split.md` — código pronto NestJS/Prisma para routing leitura/escrita
- `03-self-managed-replication.md` — scripts on-prem (streaming replication, PgBouncer, HAProxy, Patroni)
- `04-monitoring.sql` — queries de monitorização de performance, lag de réplica e saúde
- `05-f2-activation-runbook.md` — runbook executável: provisionar réplica → secrets staging → `USE_REPLICAS=true` → load-test (Fase F2)

> Verificação da réplica: `node scripts/verify-replica.cjs --probe-lag` (também `npm run db:verify-replica`) confirma standby + lag antes de activar.
