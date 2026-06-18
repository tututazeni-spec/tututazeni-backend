# Fase 5 (opcional) — Self-Managed: Streaming Replication On-Prem

> ⚠️ Use isto **apenas** se houver obrigação de servidor próprio (on-premise).
> Auto-gerir replicação + failover é trabalho de DBA a tempo parcial. Se puder, prefira o
> Postgres gerido (`01-managed-postgres.md`). Aqui está o setup completo e correcto.

Arquitectura alvo:

```
                    ┌──────────────┐
   App (NestJS) ──► │   HAProxy    │  (balanceamento + health checks)
                    └──────┬───────┘
            escrita ──────┘   └────── leitura
              │                          │
      ┌───────▼────────┐        ┌────────▼────────┐   ┌────────────────┐
      │  PgBouncer (W) │        │  PgBouncer (R)  │   │   PgBouncer (R) │
      └───────┬────────┘        └────────┬────────┘   └───────┬────────┘
      ┌───────▼────────┐        ┌────────▼────────┐   ┌───────▼────────┐
      │  PRIMARY (RW)  │ ─────► │   REPLICA 1 (RO) │   │  REPLICA 2 (RO)│
      └────────────────┘ stream └─────────────────┘   └────────────────┘
              ▲ Patroni + etcd gerem failover automático (eleição de novo primary)
```

PostgreSQL 16 assumido. Ajustar caminhos (`/etc/postgresql/16/main`, `/var/lib/postgresql/16/main`).

---

## 1. PRIMARY — `postgresql.conf` (streaming replication)

```ini
# --- Replicação ---
listen_addresses = '*'
wal_level = replica
max_wal_senders = 10            # nº de réplicas + folga
max_replication_slots = 10
wal_keep_size = 1024            # MB de WAL retido (evita réplica perder o fio)
hot_standby = on
synchronous_commit = on

# --- Tuning base (ajustar à RAM da máquina; exemplo p/ 16GB) ---
shared_buffers = 4GB            # ~25% RAM
effective_cache_size = 12GB     # ~75% RAM
work_mem = 32MB
maintenance_work_mem = 512MB
max_connections = 200           # baixe se usar PgBouncer (recomendado)

# --- Observabilidade ---
log_min_duration_statement = 500   # loga queries > 500ms (alinha com SLOW_QUERY_MS da app)
shared_preload_libraries = 'pg_stat_statements'
```

## 2. PRIMARY — `pg_hba.conf` (permitir réplicas)

```conf
# TYPE  DATABASE        USER         ADDRESS              METHOD
host    replication     replicator   10.0.0.0/24          scram-sha-256
host    innova          innova_app   10.0.0.0/24          scram-sha-256
```

## 3. PRIMARY — criar utilizador de replicação + slots

```sql
-- sql/01-setup-replication.sql
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'TROCAR_PASSWORD_FORTE';

-- Um slot por réplica (impede o primary de apagar WAL ainda não consumido)
SELECT pg_create_physical_replication_slot('replica_1');
SELECT pg_create_physical_replication_slot('replica_2');

-- Extensão de monitorização de queries
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Aplicar e reiniciar:
```bash
sudo -u postgres psql -d innova -f sql/01-setup-replication.sql
sudo systemctl restart postgresql
```

---

## 4. REPLICA — provisionar a partir do primary

Em **cada** réplica (parar o Postgres, limpar o data dir, clonar do primary):

```bash
sudo systemctl stop postgresql
sudo -u postgres rm -rf /var/lib/postgresql/16/main/*

# Clone físico do primary (cria standby.signal e primary_conninfo automaticamente)
sudo -u postgres pg_basebackup \
  -h PRIMARY_IP -p 5432 -U replicator \
  -D /var/lib/postgresql/16/main \
  -Fp -Xs -P -R \
  -S replica_1                 # usar replica_2 na segunda réplica
```

O `-R` escreve em `postgresql.auto.conf`:
```ini
primary_conninfo = 'host=PRIMARY_IP port=5432 user=replicator password=... application_name=replica_1'
primary_slot_name = 'replica_1'
```

Garantir `hot_standby = on` (herdado do primary) e arrancar:
```bash
sudo systemctl start postgresql
# Confirmar que está em recovery (= é réplica)
sudo -u postgres psql -c "SELECT pg_is_in_recovery();"   -- deve devolver 't'
```

### Validar a replicação (no primary)
```sql
SELECT client_addr, application_name, state, sync_state,
       pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS lag
FROM pg_stat_replication;
```

---

## 5. PgBouncer (connection pooling) — `pgbouncer.ini`

```ini
[databases]
innova = host=127.0.0.1 port=5432 dbname=innova

[pgbouncer]
listen_addr = *
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction        # melhor para apps web; ver nota Prisma abaixo
max_client_conn = 2000
default_pool_size = 25
reserve_pool_size = 5
server_idle_timeout = 600
```

> **Prisma + PgBouncer transaction mode:** acrescente `pgbouncer=true` à connection string e
> mantenha `DB_POOL_MAX` baixo na app. Prepared statements são geridos pela extensão.

---

## 6. HAProxy — balanceamento + separação RW/RO — `haproxy.cfg`

Usa o endpoint REST do Patroni (porta 8008) como health check para saber quem é o primary.

```cfg
global
    maxconn 4000

defaults
    mode tcp
    timeout connect 5s
    timeout client  30m
    timeout server  30m

# --- ESCRITA: só o primary (Patroni responde 200 em /primary) ---
listen postgres_write
    bind *:5000
    option httpchk GET /primary
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
    server pg1 10.0.0.11:6432 check port 8008
    server pg2 10.0.0.12:6432 check port 8008
    server pg3 10.0.0.13:6432 check port 8008

# --- LEITURA: réplicas (Patroni responde 200 em /replica) ---
listen postgres_read
    bind *:5001
    balance roundrobin
    option httpchk GET /replica
    http-check expect status 200
    default-server inter 3s fall 3 rise 2
    server pg1 10.0.0.11:6432 check port 8008
    server pg2 10.0.0.12:6432 check port 8008
    server pg3 10.0.0.13:6432 check port 8008
```

Na app: `DATABASE_URL` → `haproxy:5000` (escrita); `DATABASE_REPLICA_URL` → `haproxy:5001` (leitura).

---

## 7. Failover automático — Patroni — `patroni.yml`

> Patroni + etcd elegem um novo primary automaticamente se o actual cair, **sem split-brain**.
> Um ficheiro por nó (ajustar `name` e IPs).

```yaml
scope: innova-cluster
name: pg1                       # pg2 / pg3 nos outros nós

restapi:
  listen: 0.0.0.0:8008
  connect_address: 10.0.0.11:8008

etcd3:
  hosts: 10.0.0.21:2379,10.0.0.22:2379,10.0.0.23:2379   # 3 nós etcd p/ quórum

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576   # 1MB: não promove réplica muito atrasada
    postgresql:
      use_pg_rewind: true
      parameters:
        wal_level: replica
        hot_standby: "on"
        max_wal_senders: 10
        max_replication_slots: 10

postgresql:
  listen: 0.0.0.0:5432
  connect_address: 10.0.0.11:5432
  data_dir: /var/lib/postgresql/16/main
  bin_dir: /usr/lib/postgresql/16/bin
  authentication:
    replication: { username: replicator, password: TROCAR }
    superuser:   { username: postgres,   password: TROCAR }
```

```bash
# Iniciar em cada nó (Patroni passa a gerir o Postgres — não inicie o postgres manualmente)
patroni /etc/patroni/patroni.yml

# Estado do cluster e quem é o líder (primary)
patronictl -c /etc/patroni/patroni.yml list

# Teste de failover manual (planeado)
patronictl -c /etc/patroni/patroni.yml switchover
```

> **Regra crítica anti-split-brain:** com Patroni, **nunca** inicie/promova o Postgres à mão.
> Toda a gestão de quem é primary passa por Patroni + etcd. É exactamente o que evita dois
> masters a aceitar escrita ao mesmo tempo.

---

## 8. Backups (obrigatório, mesmo com réplica)

Réplica **não é backup** (um `DELETE` errado replica-se para a réplica em segundos). Use `pgBackRest`:

```bash
# Backup completo + incrementais + retenção
pgbackrest --stanza=innova --type=full backup      # semanal
pgbackrest --stanza=innova --type=incr backup      # diário
pgbackrest --stanza=innova restore                 # point-in-time recovery
```
