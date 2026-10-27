# INNOVA — Plano de Disaster Recovery (DR)

> **Versão:** 1.1 | **Classificação:** Confidencial — Ops Only  
> **Última revisão:** 2026-10 (BD passou a DigitalOcean Managed PostgreSQL; WAL-G removido)  
> **Próxima revisão obrigatória:** 2027-04

---

## 1. Arquitectura de recuperação

A base de dados é **DigitalOcean Managed PostgreSQL**. Há duas camadas de recuperação, independentes de propósito:

| Camada | O que é | Onde vive | Cobre |
|---|---|---|---|
| **A. Backups do provider** | Backup diário + PITR (WAL a cada ~5 min), retenção de 7 dias | Dentro do DigitalOcean | Erro humano, corrupção lógica, perda de nó |
| **B. `pg_dump` cifrado → S3** | Dump completo diário (GPG AES-256) | Bucket S3 com Object Lock + réplica noutra região | Perda/destruição do cluster, conta DO comprometida, retenção > 7 dias |

> **Porque é que a camada B existe:** os backups do provider são apagados quando o cluster é destruído, e partilham a conta DigitalOcean. Quem apagar o cluster (erro, token roubado) apaga também os backups. A cópia no S3 está fora dessa conta.

Além da BD, o `backup-secrets.sh` guarda cifrados no S3 o `.env.production` e o certificado Origin CA (semanal).

## 2. Objectivos e Métricas

| Métrica | Alvo | Condição |
|---|---|---|
| **RPO** — erro humano / corrupção | ≈ 5 min | PITR do DO, dentro dos últimos 7 dias |
| **RPO** — cluster perdido / conta comprometida | ≤ 24 h | Último `pg_dump` no S3 |
| **RTO** — falha total | ≤ 4 h | **Não medido** — ver secção 11 (drill por fazer) |
| **RTO** — restart da app | ≤ 30 min | |

> Os valores de RPO do DO vêm da documentação do provider. O RTO só passa a ser um número real depois do primeiro drill.

---

## 3. Contactos de Emergência

| Papel | Nome | Canal primário | Canal secundário |
|---|---|---|---|
| SRE / On-call | — | Telegram `@CHANGE_ME` | Tel: `+351 XXX XXX XXX` |
| DBA | — | Telegram `@CHANGE_ME` | — |
| Product Owner | — | — | — |
| DigitalOcean Support | — | Painel DO → Support | — |
| AWS Support (S3 de backups) | — | Console AWS → Support | — |

> Preencher antes de colocar em produção.

---

## 4. Classificação de Incidentes

| Nível | Descrição | Exemplos | Acção imediata |
|---|---|---|---|
| **P1 — Crítico** | Serviço completamente indisponível | App em crash loop, BD inacessível, dados corruptos | DR imediato, notificar stakeholders em < 15 min |
| **P2 — Alto** | Degradação severa | Latência > 10s, erros 5xx > 10%, backup falhou há 48h | Investigar imediatamente, DR se não resolver em 1h |
| **P3 — Médio** | Degradação parcial | Módulo específico falha, backup falhou (< 48h) | Investigar em horário de trabalho |
| **P4 — Baixo** | Impacto mínimo | Alerta de disco < 20%, cache miss elevado | Tratar no próximo sprint |

---

## 5. Árvore de Decisão — Qual Procedimento Usar

```
A aplicação está em baixo?
│
├── NÃO → É a base de dados?
│         ├── NÃO → Secção 8 (App Restart / Rollback)
│         └── SIM → Secção 9 (BD inacessível)
│
└── SIM → Os dados estão corrompidos / perdidos?
          ├── NÃO → Secção 8 (App Restart)
          └── SIM → Qual a causa?
                    ├── Erro humano (DROP TABLE, UPDATE sem WHERE) → Secção 10A (PITR do DO)
                    ├── Cluster apagado / conta DO comprometida     → Secção 10B (restore do S3)
                    └── Ransomware / intrusão no VPS               → Secção 10C (rebuild isolado)
```

---

## 6. Checklist Pré-DR (antes de qualquer restore)

- [ ] Confirmar que o incidente não é um falso positivo (Prometheus / alertas)
- [ ] Notificar a equipa e documentar: hora de início, sintomas, quem está a tratar
- [ ] **PARAR** a app antes de qualquer restore:
  ```bash
  docker compose -f /opt/innova/docker-compose.prod.yml stop app
  ```
- [ ] **Não destruir o cluster actual** (mesmo corrompido) até o novo estar validado — os backups do DO morrem com ele
- [ ] Ver backups disponíveis no S3:
  ```bash
  set -a; . /opt/innova/.env.production; set +a
  /opt/innova/backup/restore-postgres.sh --list
  ```
- [ ] Ver backups/PITR no DO: painel → Databases → cluster → Backups
- [ ] Identificar o ponto de restore pretendido (timestamp, com fuso horário)

---

## 7. Inventário de Infraestrutura

| Componente | Localização | Acesso |
|---|---|---|
| VPS App | `DEPLOY_HOST` | SSH com `DEPLOY_SSH_KEY` |
| PostgreSQL | DigitalOcean Managed PostgreSQL — `DATABASE_URL` em `.env.production` (ligação **directa**, não o connection pool) | Painel DO + credenciais do `.env.production` |
| Bucket S3 primário | `eu-south-1` — `innova-backups-prod` | IAM `innova-backup-reader` |
| Bucket S3 réplica | `eu-west-1` — `innova-backups-prod-replica-eu-west-1` | IAM `innova-backup-reader` |
| Dumps | `s3://<bucket>/innova/postgres/AAAA/MM/DD/*.dump.gpg` | `restore-postgres.sh` |
| Segredos | `s3://<bucket>/innova/secrets/AAAA/MM/*.tar.gz.gpg` | `backup-secrets.sh --restore` |
| Passphrase GPG | **Cofre de passwords, fora do VPS** | Obrigatório para abrir dumps e segredos |
| Prometheus/Alertmanager | VPS `127.0.0.1:9090` | Túnel SSH |
| Logs de backup | VPS `/var/log/innova-backup.log` | SSH |

---

## 8. Procedimento: App Restart / Rollback de Deploy

**Quando usar:** App em crash loop, deploy com bug, sem perda de dados. **Duração:** 5–15 min.

```bash
ssh deploy@$DEPLOY_HOST
C="docker compose -f /opt/innova/docker-compose.prod.yml"

$C ps                          # estado e health das réplicas
$C logs --tail=50 app

$C restart app                 # Opção A — restart simples
/opt/innova/deploy/rollback.sh # Opção B — voltar à tag anterior

curl -sf https://$DOMAIN/health/ready && echo OK || echo FALHOU
```

> O serviço `app` não publica porta no host: não há `localhost:4000`. Testar sempre via domínio (Caddy) ou `$C exec`.

---

## 9. Procedimento: BD inacessível (sem perda de dados)

**Quando usar:** o cluster não responde mas os dados estão intactos.

1. Painel DO → cluster → estado e eventos de manutenção/falha. Confirmar com `pg_isready -h <host> -p <porta>`.
2. Se existir *standby node*, o DO faz failover automático e a connection string mantém-se (confirmar no painel). Sem standby, abrir ticket P1 no DO.
3. Verificar que o IP do VPS continua em *Trusted Sources* do cluster.
4. Depois de a BD voltar: `$C restart pgbouncer app` e validar `/health/ready`.

---

## 10A. Procedimento: PITR do DigitalOcean (erro humano)

**Quando usar:** DROP TABLE acidental, UPDATE sem WHERE, corrupção lógica dentro dos últimos 7 dias. **Duração:** 30–90 min (depende do tamanho).

> **O restore do DO nunca é no sítio:** cria **sempre um cluster novo**. O cluster antigo fica intacto até o apagares.

1. Parar a app (secção 6).
2. Painel DO → cluster → *Actions → Restore from backup* → escolher **ponto no tempo** (2 min antes do erro) → dar nome ao novo cluster.
3. Quando estiver `online`: adicionar o IP do VPS a *Trusted Sources* do cluster novo e criar/confirmar o utilizador e a base `innova`.
4. Editar `DATABASE_URL` (e `DATABASE_POOLER_URL`/`DATA_SOURCE_NAME` do exporter, se usados) em `/opt/innova/.env.production` para o cluster novo.
5. `$C up -d pgbouncer postgres-exporter && $C up -d app` e correr a checklist da secção 11.
6. Só destruir o cluster antigo **depois** de validado e com um `pg_dump` fresco do novo no S3.

---

## 10B. Procedimento: Cluster apagado / conta DO comprometida (restore do S3)

**Quando usar:** cluster destruído (e com ele os backups do DO), token/conta DO comprometidos. RPO ≤ 24 h. **Duração:** 2–6 h.

```bash
# 1. Criar novo cluster Managed PostgreSQL (MESMA versão major ou superior) + base e utilizador

# 2. No VPS, com o .env.production (ver 10C se o VPS também se perdeu)
set -a; . /opt/innova/.env.production; set +a
export DATABASE_URL='postgresql://USER:PASS@NOVO_HOST:PORTA/innova?sslmode=require'

# 3. Listar e restaurar (interactivo, pede confirmação; a app tem de estar parada)
/opt/innova/backup/restore-postgres.sh --list
/opt/innova/backup/restore-postgres.sh latest

# 4. Actualizar DATABASE_URL no .env.production, subir pgbouncer e app, validar
```

Notas: o `pg_restore` usa `--clean --exit-on-error`; em Postgres gerido, erros de extensões/ownership podem interromper o restore — se acontecer, anotar o erro (é o tipo de coisa que o drill deve apanhar). Passwords no `DATABASE_URL` devem estar URL-encoded; o script decodifica.

---

## 10C. Procedimento: Ransomware / Intrusão no VPS

**Quando usar:** comprometimento confirmado do VPS. Não restaurar para o ambiente infectado. **Duração:** 2–4 h.

1. **Isolar**: desligar o VPS na consola do provider (não via SSH).
2. **Revogar** credenciais que estavam no VPS: chaves IAM `innova-backup-writer`, token da API DO, `JWT_SECRET`, `JWT_REFRESH_SECRET`, password da BD, SMTP, restantes segredos do `.env.production`.
3. Novo VPS limpo; instalar Docker, `aws`, `gnupg`, `postgresql-client` (versão ≥ à do cluster).
4. Recuperar segredos com as credenciais do **backup-reader** (só leitura), de preferência do bucket **réplica**:
   ```bash
   export BACKUP_S3_BUCKET=innova-backups-prod-replica-eu-west-1 AWS_DEFAULT_REGION=eu-west-1
   export BACKUP_ENCRYPT_PASSPHRASE='<do cofre>'
   /opt/innova/backup/backup-secrets.sh --restore latest /opt/innova   # chmod 600 .env.production caddy/origin/*.pem
   ```
   Depois **rodar** todos os segredos recuperados (passo 2) antes de pôr em produção.
5. A BD no DO pode continuar intacta: rodar a password do utilizador e restringir *Trusted Sources* ao IP do novo VPS. Se houver dúvida sobre integridade dos dados, usar 10A (PITR para antes da intrusão) ou 10B.
6. Forensics: snapshot do disco do VPS antigo **antes** de o apagar; contactar a equipa de segurança.
7. Novo `BACKUP_ENCRYPT_PASSPHRASE` para os backups seguintes.

---

## 11. Verificação Pós-Restore (Checklist Obrigatório)

- [ ] PostgreSQL aceita ligações: `pg_isready -h $DB_HOST -p $DB_PORT`
- [ ] Tabelas críticas existem: `User`, `Course`, `Enrollment`, `Department`, `Role`, `AuditLog`
- [ ] Contagem de utilizadores plausível: `SELECT count(*) FROM "User";`
- [ ] `$C ps` — réplicas `app` e `frontend` *healthy*; `$C logs --tail=100 app` sem erros
- [ ] `curl -sf https://$DOMAIN/health/ready`
- [ ] Login funciona com um utilizador real
- [ ] LPDP: reaplicar eliminações já concluídas (o backup traz de volta dados apagados): `POST /settings/privacy/erasures/reapply` como ADMIN; confirmar `reapplied` e arquivar o resultado
- [ ] Backup imediato pós-restore: `set -a; . /opt/innova/.env.production; set +a; /opt/innova/backup/backup-postgres.sh`
- [ ] Crons activos: `crontab -l | grep INNOVA-BACKUP`
- [ ] Documentar o incidente e RCA em < 24 h (secção 13)

---

## 12. Drill de DR (Simulacro)

Realizar **a cada 6 meses**, sempre contra um cluster de **staging** (nunca produção):

1. **Drill do S3:** criar cluster de staging; `DATABASE_URL` → staging; `restore-postgres.sh latest`; medir o tempo total e anotar quaisquer erros de `pg_restore`.
2. **Drill do PITR do DO:** restaurar o cluster de produção para um cluster novo num ponto no tempo conhecido; validar contagens.
3. **Drill dos segredos:** `backup-secrets.sh --restore latest /tmp/x` e comparar com o `.env.production` real.
4. Registar: data, RTO medido, problemas, correcções. Actualizar a secção 2 com o RTO real.

**Último drill:** ❌ **Não realizado.** Sem ele o RTO e a compatibilidade do restore em Postgres gerido não estão provados.

---

## 13. Histórico de Incidentes

| Data | Tipo | RTO real | Causa | Acção tomada |
|---|---|---|---|---|
| — | — | — | — | — |

---

## 14. Referências

| Recurso | Localização |
|---|---|
| Backup `pg_dump` → S3 | `ops/backup/backup-postgres.sh` |
| Restore `pg_dump` | `ops/backup/restore-postgres.sh` |
| Verificação semanal | `ops/backup/verify-backup.sh` |
| Backup/restore de segredos | `ops/backup/backup-secrets.sh` |
| Instalação dos crons | `ops/backup/install-cron.sh` (reinstalados em cada `deploy.sh`) |
| Activação (setup) | `ops/backup/setup-backup.sh` |
| Métricas Prometheus | `ops/backup/backup-metrics.sh` |
| Infra S3 (Terraform) | `ops/infra/s3-backup/` |
| Alertas | `ops/monitoring/alert-rules.yml` (grupo `innova-backup`) |
| Deploy pipeline | `.github/workflows/deploy.yml` |
| Docs do provider | https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/ |
