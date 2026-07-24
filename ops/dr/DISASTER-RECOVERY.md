# INNOVA — Plano de Disaster Recovery (DR)

> **Versão:** 1.0 | **Classificação:** Confidencial — Ops Only  
> **Última revisão:** 2026-07  
> **Próxima revisão obrigatória:** 2027-01

---

## 1. Objectivos e Métricas

| Métrica | Definição | Alvo |
|---|---|---|
| **RPO** (Recovery Point Objective) | Máximo de dados perdidos | ≤ 60 segundos (com WAL-G) / ≤ 24h (só pg_dump) |
| **RTO** (Recovery Time Objective) | Tempo máximo até serviço restaurado | ≤ 4 horas (falha total) / ≤ 30 min (app restart) |
| **MTTR** | Tempo médio de recuperação | < 2 horas |

> **Nota:** O RPO de 60s só é garantido se o WAL-G estiver configurado e a arquivar WAL continuamente. Sem WAL-G, o RPO é igual ao intervalo do cron de pg_dump (24h).

---

## 2. Contactos de Emergência

| Papel | Nome | Canal primário | Canal secundário |
|---|---|---|---|
| SRE / On-call | — | Telegram `@CHANGE_ME` | Tel: `+351 XXX XXX XXX` |
| DBA | — | Telegram `@CHANGE_ME` | — |
| Product Owner | — | — | — |
| AWS Support | — | Console AWS → Support | Plano Business/Enterprise obrigatório |

> Preencher antes de colocar em produção.

---

## 3. Classificação de Incidentes

| Nível | Descrição | Exemplos | Acção imediata |
|---|---|---|---|
| **P1 — Crítico** | Serviço completamente indisponível | App em crash loop, BD inacessível, dados corruptos | DR imediato, notificar stakeholders em < 15 min |
| **P2 — Alto** | Degradação severa | Latência > 10s, erros 5xx > 10%, backup falhou há 48h | Investigar imediatamente, DR se não resolver em 1h |
| **P3 — Médio** | Degradação parcial | Módulo específico falha, backup falhou (< 48h) | Investigar em horário de trabalho |
| **P4 — Baixo** | Impacto mínimo | Alerta de disco < 20%, cache miss elevado | Tratar no próximo sprint |

---

## 4. Árbol de Decisão — Qual Procedimento Usar

```
A aplicação está em baixo?
│
├── NÃO → É a base de dados?
│         ├── NÃO → Ver Secção 7 (App Restart / Rollback)
│         └── SIM → Ver Secção 8 (Failover BD)
│
└── SIM → Os dados estão corrompidos / perdidos?
          ├── NÃO → Ver Secção 7 (App Restart)
          └── SIM → Qual a causa?
                    ├── Crash do servidor PostgreSQL → Secção 9A (PITR com WAL-G)
                    ├── Erro humano (DROP TABLE, etc.) → Secção 9B (PITR para ponto específico)
                    ├── Ransomware / intrusão → Secção 9C (Restore isolado)
                    └── Falha de hardware total → Secção 9D (Restore completo)
```

---

## 5. Checklist Pré-DR (antes de qualquer restore)

- [ ] Confirmar que o incidente não é um falso positivo (verificar Prometheus/Grafana)
- [ ] Notificar a equipa (Telegram, canal `#ops-alerts`)
- [ ] Documentar o início do incidente: hora, sintomas, quem está a tratar
- [ ] **PARAR** a aplicação INNOVA antes de qualquer restore de BD
  ```bash
  docker compose -f /opt/innova/docker-compose.prod.yml stop app
  ```
- [ ] Fazer snapshot do estado actual (se possível) antes de alterar qualquer coisa
- [ ] Verificar backups disponíveis:
  ```bash
  # pg_dump backups
  . /opt/innova/.env.production && \
    /opt/innova/backup/restore-postgres.sh --list

  # WAL-G backups
  sudo -u postgres wal-g backup-list
  ```
- [ ] Identificar o ponto de restore pretendido (timestamp)
- [ ] Confirmar credenciais AWS funcionais:
  ```bash
  aws s3 ls s3://${BACKUP_S3_BUCKET}/
  ```

---

## 6. Inventário de Infraestrutura

| Componente | Localização | Acesso |
|---|---|---|
| VPS App | `DEPLOY_HOST` (var GitHub Secrets) | SSH com `DEPLOY_SSH_KEY` |
| Servidor PostgreSQL | Externo ao Docker Compose — ver `DATABASE_URL` em `.env.production` | Credenciais em `.env.production` |
| Bucket S3 Primário | `eu-south-1` — `innova-backups-prod` | IAM `innova-backup-reader` |
| Bucket S3 Réplica | `eu-west-1` — `innova-backups-prod-replica-eu-west-1` | IAM `innova-backup-reader` |
| Prometheus/Alertmanager | VPS, porta `127.0.0.1:9090` | Túnel SSH |
| Logs de backup | VPS: `/var/log/innova-backup.log` | SSH |
| Logs WAL-G | Servidor PG: `/var/log/innova-walg.log` | SSH ao servidor PG |

---

## 7. Procedimento: App Restart / Rollback de Deploy

**Quando usar:** App em crash loop, deploy com bug, sem perda de dados.

**Duração estimada:** 5–15 minutos

```bash
# SSH para o VPS
ssh deploy@$DEPLOY_HOST

# 1. Ver estado actual
docker ps
docker logs innova-app --tail=50

# 2. Opção A — Restart simples
docker compose -f /opt/innova/docker-compose.prod.yml restart app

# 3. Opção B — Rollback para tag anterior (ver deploy.yml)
/opt/innova/deploy/rollback.sh

# 4. Verificar saúde
curl -sf http://localhost:4000/health/ready && echo "OK" || echo "FALHOU"

# 5. Verificar smoke test
curl -sf http://localhost:4000/health/live && echo "OK"
```

---

## 8. Procedimento: Failover de Base de Dados

**Quando usar:** Servidor PostgreSQL primário inacessível, sem perda de dados (leitura funciona).

**Duração estimada:** 30–60 minutos

```bash
# 1. Confirmar que o primário está mesmo em baixo
pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER

# 2. Se existir read-replica configurada, promover
# (ajustar conforme a infra específica — RDS, pgBouncer, etc.)

# 3. Actualizar DATABASE_URL no .env.production para apontar para a réplica
nano /opt/innova/.env.production
# DATABASE_URL=postgresql://USER:PASS@REPLICA_HOST:5432/innova

# 4. Reiniciar a app
docker compose -f /opt/innova/docker-compose.prod.yml up -d app

# 5. Validar
curl -sf http://localhost:4000/health/ready
```

---

## 9A. Procedimento: Restore via pg_dump (sem PITR)

**Quando usar:** WAL-G não disponível, RPO aceite de até 24h.

**Duração estimada:** 1–3 horas (dependendo do tamanho da BD)

```bash
# No VPS (/opt/innova)
. .env.production

# 1. Listar backups disponíveis
/opt/innova/backup/restore-postgres.sh --list

# 2. Restaurar o último backup (interactivo — pede confirmação)
/opt/innova/backup/restore-postgres.sh latest

# 3. Ou restaurar um backup específico
/opt/innova/backup/restore-postgres.sh s3://innova-backups-prod/innova/postgres/2026/07/23/innova_20260723_020000.dump.gpg

# 4. Após restore, verificar e reiniciar app
curl -sf http://localhost:4000/health/ready
docker compose -f /opt/innova/docker-compose.prod.yml restart app
```

---

## 9B. Procedimento: PITR com WAL-G (erro humano)

**Quando usar:** DROP TABLE acidental, UPDATE sem WHERE, corrupção lógica. RPO = ponto exacto antes do erro.

**Duração estimada:** 30–90 minutos

```bash
# No servidor PostgreSQL (não no VPS da app)

# 1. Identificar o timestamp do incidente (ver logs da app ou Postgres)
# Exemplo: "2026-07-23 14:32:00" (2 minutos antes do erro confirmado)

# 2. Parar a app primeiro (no VPS)
# ssh deploy@$VPS_HOST "docker compose -f /opt/innova/docker-compose.prod.yml stop app"

# 3. Verificar backups disponíveis
sudo -u postgres wal-g backup-list

# 4. Executar restore PITR (interactivo)
sudo -u postgres /opt/innova/backup/walg/walg-pitr-restore.sh "2026-07-23 14:30:00"

# 5. Seguir as instruções do script (reiniciar PG, verificar, reiniciar app)
```

---

## 9C. Procedimento: Restore Isolado (Ransomware / Intrusão)

**Quando usar:** Comprometimento confirmado do servidor. Não restaurar para o mesmo ambiente infectado.

**Duração estimada:** 2–4 horas

> ⚠️ **Não usar o servidor comprometido.** Criar infraestrutura nova antes de restaurar.

```bash
# 1. ISOLAR imediatamente o servidor comprometido
#    → Desligar na console do VPS provider (não via SSH — pode estar comprometido)
#    → Revogar as chaves IAM do backup-writer comprometidas

# 2. Revogar credenciais comprometidas na AWS Console
#    → IAM → Users → innova-backup-writer → Security credentials → Delete access key

# 3. Criar novo VPS limpo com a mesma configuração

# 4. Usar as credenciais do backup-READER (não writer) para o restore
#    → Bucket réplica (eu-west-1) em vez do primário (pode estar comprometido)

# 5. Restaurar no novo servidor usando o bucket réplica
export BACKUP_S3_BUCKET="innova-backups-prod-replica-eu-west-1"
export AWS_DEFAULT_REGION="eu-west-1"
# Usar credenciais do backup-reader (read-only)

/opt/innova/backup/restore-postgres.sh latest

# 6. Fazer forensics do servidor comprometido ANTES de o apagar
#    → Tirar snapshot do disco (console do provider)
#    → Contactar equipa de segurança

# 7. Após restore e validação, gerar novas credenciais para tudo:
#    → JWT_SECRET, JWT_REFRESH_SECRET
#    → BACKUP_ENCRYPT_PASSPHRASE (novo para os próximos backups)
#    → Chaves IAM (novo utilizador ou nova access key)
```

---

## 9D. Procedimento: Restore Completo (Falha de Hardware Total)

**Quando usar:** Servidor PostgreSQL perdido definitivamente (falha de hardware, datacenter).

**Duração estimada:** 2–6 horas

```bash
# 1. Provisionar novo servidor PostgreSQL
#    → Mesma versão do PostgreSQL
#    → Criar base de dados e utilizador com as mesmas credenciais

# 2. Instalar WAL-G (se usando PITR)
sudo bash /opt/innova/backup/walg/install-walg.sh

# 3. Preencher /etc/walg/walg.env com credenciais do backup-reader

# 4. Restaurar último backup WAL-G (inclui WAL até ao crash)
sudo systemctl stop postgresql
sudo -u postgres /opt/innova/backup/walg/walg-pitr-restore.sh latest
sudo systemctl start postgresql

# 5. Verificar integridade
psql -U postgres -d innova -c 'SELECT count(*) FROM "User";'
psql -U postgres -d innova -c '\dt' | wc -l  # contar tabelas

# 6. Actualizar DATABASE_URL no .env.production com novo host

# 7. Reiniciar app
docker compose -f /opt/innova/docker-compose.prod.yml up -d

# 8. Smoke test completo
curl -sf https://$DOMAIN/health/ready
npm run test:regression  # ver deploy.yml
```

---

## 10. Verificação Pós-Restore (Checklist Obrigatório)

Após qualquer restore, verificar **nesta ordem**:

- [ ] PostgreSQL aceita conexões: `pg_isready -h $DB_HOST`
- [ ] Número de tabelas correcto: `psql -c '\dt' | wc -l` (comparar com valor conhecido)
- [ ] Tabelas críticas existem: `User`, `Course`, `Enrollment`, `Department`, `Role`, `AuditLog`
- [ ] Contagem de utilizadores plausível: `SELECT count(*) FROM "User";`
- [ ] App inicia sem erros: `docker logs innova-app --tail=100`
- [ ] Health check verde: `curl -sf https://$DOMAIN/health/ready`
- [ ] Login funciona: testar com um utilizador real
- [ ] Backup imediato pós-restore: `npm run seed:loadtest || true && /opt/innova/backup/backup-postgres.sh`
- [ ] Verificar que o cron de backup está activo: `crontab -l | grep INNOVA`
- [ ] Documentar o incidente e RCA (Root Cause Analysis) em < 24h

---

## 11. Drill de DR (Simulacro)

Realizar **a cada 6 meses** em ambiente de staging:

```bash
# 1. Criar BD de staging limpa
# 2. Correr restore do último backup de produção para staging
/opt/innova/backup/restore-postgres.sh latest
# (usar DATABASE_URL a apontar para staging, nunca produção)

# 3. Medir o RTO real (tempo total do drill)
# 4. Verificar que os dados fazem sentido (contagens, datas)
# 5. Registar resultado: data, RTO medido, problemas encontrados
```

**Último drill:** Não realizado ainda — agendar para Q3 2026.

---

## 12. Histórico de Incidentes

| Data | Tipo | RTO real | Causa | Acção tomada |
|---|---|---|---|---|
| — | — | — | — | — |

---

## 13. Referências

| Recurso | Localização |
|---|---|
| Script de backup pg_dump | `ops/backup/backup-postgres.sh` |
| Script de restore pg_dump | `ops/backup/restore-postgres.sh` |
| Verificação de integridade | `ops/backup/verify-backup.sh` |
| WAL-G — instalação | `ops/backup/walg/install-walg.sh` |
| WAL-G — backup | `ops/backup/walg/walg-backup.sh` |
| WAL-G — restore PITR | `ops/backup/walg/walg-pitr-restore.sh` |
| Terraform S3 | `ops/infra/s3-backup/` |
| Alert rules backup | `ops/monitoring/alert-rules.yml` (grupo `innova-backup`) |
| Deploy pipeline | `.github/workflows/deploy.yml` |
| Configuração Postgres WAL | `ops/backup/walg/postgresql-walg.conf` |
| Script de verificação WAL-G | `ops/backup/walg/verify-walg-backup.sh` |
| Script de activação (setup) | `ops/backup/setup-backup.sh`            |
