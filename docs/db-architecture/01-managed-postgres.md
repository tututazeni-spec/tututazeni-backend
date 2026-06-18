# Fase 1–2 — PostgreSQL Gerido: Primary + Read Replica

> Esta é a via recomendada. O provider opera replicação e failover por si.
> Os exemplos usam comandos genéricos + notas por provider (Supabase / Neon / AWS RDS).

---

## A. Escolha do provider (resumo para decisão)

| Provider | Réplica leitura | Failover | Notas para vibe coder |
|---|---|---|---|
| **Supabase** | Sim (Read Replicas) | Sim (gerido) | Mais simples; UI amigável; Postgres puro |
| **Neon** | Sim (compute replicas) | Sim | Separa storage/compute; bom para escalar leitura |
| **AWS RDS / Aurora** | Sim (Read Replicas / Reader endpoint) | **Multi-AZ automático** | Mais "enterprise"; mostra bem ao cliente; mais caro |
| **Azure DB for PostgreSQL** | Sim (Read Replicas) | Zona-redundante | Bom se já usam Azure |

> Recomendação para este caso (cliente exige master-slave, vibe coder a operar):
> **AWS RDS Multi-AZ + 1 Read Replica** — o failover automático Multi-AZ é exactamente
> o "failover automático" do requisito, certificado e operado pela AWS.

---

## B. Pré-requisitos / connection pooling (Fase 1)

A esta escala, **o pooler é o ganho nº1**. Todos os providers oferecem um:

- **Supabase:** usar a *connection string* do **Pooler (Supavisor)** — porta `6543`, modo `transaction`.
- **AWS RDS:** activar **RDS Proxy**.
- **Neon:** usar a string `-pooler`.

No vosso `.env` (a app já lê `DATABASE_URL`):

```dotenv
# Escrita (primary, via pooler)
DATABASE_URL="postgresql://USER:PASS@PRIMARY-POOLER-HOST:6543/innova?sslmode=require&pgbouncer=true"

# Leitura (read replica / reader endpoint) — NOVO, usado em 02-app-read-write-split.md
DATABASE_REPLICA_URL="postgresql://USER:PASS@REPLICA-HOST:5432/innova?sslmode=require"

# Feature flag de segurança para ligar/desligar routing de leitura sem deploy
USE_REPLICAS="true"
```

> Com `pgbouncer=true` em modo transaction, mantenha `DB_POOL_MAX` baixo na app (ex. 10),
> porque o pooler é que multiplexa. Ajuste o pool da app em `prisma.service.ts`.

---

## C. Provisionar primary + replica

### Supabase (mais simples)
1. Criar projecto → escolher região mais próxima dos utilizadores.
2. `Database → Read Replicas → Add replica`.
3. Copiar a connection string da réplica para `DATABASE_REPLICA_URL`.

### AWS RDS (recomendado para o requisito)
```bash
# 1. Criar a instância primary com Multi-AZ (failover automático incluído)
aws rds create-db-instance \
  --db-instance-identifier innova-primary \
  --engine postgres --engine-version 16 \
  --db-instance-class db.m6g.large \
  --allocated-storage 100 --storage-type gp3 \
  --multi-az \
  --backup-retention-period 7 \
  --master-username innova_admin \
  --manage-master-user-password \
  --db-name innova

# 2. Criar a read replica (só leitura, replicação em tempo real gerida pela AWS)
aws rds create-db-instance-read-replica \
  --db-instance-identifier innova-replica-1 \
  --source-db-instance-identifier innova-primary \
  --db-instance-class db.m6g.large

# 3. Activar o RDS Proxy (pooler) — opcional mas recomendado
#    Console: RDS → Proxies → Create proxy → target = innova-primary
```

> **Multi-AZ vs Read Replica — não confundir:**
> - **Multi-AZ** = standby *síncrono* para **failover** (NÃO serve leituras). É a resiliência.
> - **Read Replica** = standby *assíncrono* para **escalar leitura**. É a performance.
> Para o requisito do cliente quer **os dois**: Multi-AZ (failover) + Read Replica (leitura).

---

## D. Migração dos dados (banco actual → gerido)

```bash
# 1. Dump completo do banco actual (com a app DESLIGADA ou em modo leitura)
pg_dump "postgresql://USER@localhost:5432/innova_dev" \
  --no-owner --no-privileges --format=custom \
  --file=innova_dump.dump

# 2. Aplicar o schema via Prisma (recomendado em vez de restaurar DDL do dump)
#    Aponte DATABASE_URL para o NOVO primary e corra as migrações já existentes:
npx prisma migrate deploy

# 3. Restaurar apenas os DADOS para o novo primary
pg_restore --data-only --disable-triggers \
  --dbname="postgresql://USER:PASS@PRIMARY-HOST:5432/innova?sslmode=require" \
  innova_dump.dump

# 4. Validar contagens em ambos os lados
psql "$DATABASE_URL" -c "SELECT 'users' t, count(*) FROM \"User\"
  UNION ALL SELECT 'enrollment', count(*) FROM \"Enrollment\";"
```

> A réplica sincroniza automaticamente após o restore no primary. Não restaure na réplica.

---

## E. Cutover de produção (Semana 5)

1. **Anunciar janela de manutenção.**
2. Pôr a app em modo manutenção (ou read-only).
3. Último `pg_dump` incremental dos dados que mudaram (ou aceitar downtime curto do dump completo).
4. `pg_restore` no novo primary.
5. Validar contagens (passo D.4).
6. Trocar `DATABASE_URL` / `DATABASE_REPLICA_URL` no ambiente de produção.
7. Reiniciar a app. Smoke test: `npm run test:smoke`.
8. Observar `04-monitoring.sql` durante 1h.

### Rollback do cutover
- Manter o banco antigo **intacto e a correr** durante 48h.
- Se algo correr mal: reverter as env vars `DATABASE_URL`/`DATABASE_REPLICA_URL` para o banco
  antigo e reiniciar. Como não escreveu no antigo durante a janela, não há perda.

---

## F. Como demonstrar ao cliente que "master-slave" está cumprido

Capturas/relatório a entregar:
1. Print do console do provider mostrando **primary + replica** e o estado **"In sync"**.
2. Output de `04-monitoring.sql` mostrando **replication lag < 1s**.
3. Teste de failover: no provider, accionar "reboot with failover" e mostrar a app a recuperar
   sozinha em segundos (RDS Multi-AZ failover típico: 60–120s, sem intervenção).
