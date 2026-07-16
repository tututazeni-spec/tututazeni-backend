# Plano de Disaster Recovery — INNOVA

> SRE Owner: ops@innova  
> Última revisão: 2026-07-16  
> RTO alvo: 4 horas | RPO alvo: 24 horas (máximo 1 dia de dados perdidos)

---

## 1. Classificação de Cenários

| Cenário | Probabilidade | Impacto | RTO Alvo |
|---|---|---|---|
| Corrupção lógica de dados (bug, migration errada) | Médio | Alto | 2h |
| Ransomware / acesso não autorizado ao VPS | Baixo | Crítico | 4h |
| Falha de disco / crash do VPS | Baixo | Crítico | 4h |
| Falha do provider de cloud (AWS S3 indisponível) | Muito Baixo | Médio | 8h |
| Falha do Postgres (processo morreu, mas dados intactos) | Médio | Médio | 30min |

---

## 2. Arquitectura de Backup

```
VPS (PostgreSQL)
    │
    ├── Diário 02:00 ──► pg_dump --format=custom --compress=9
    │                         │
    │                    [gpg AES-256]  ← BACKUP_ENCRYPT_PASSPHRASE
    │                         │
    │                    aws s3 cp --storage-class STANDARD_IA
    │                         │
    │                    s3://BUCKET/innova/postgres/YYYY/MM/DD/innova_TIMESTAMP.dump.gpg
    │                         │
    │                    latest.txt  ← aponta ao último dump
    │
    └── Semanal Dom 04:00 ──► verify-backup.sh
                                  ├── verifica idade < 26h
                                  ├── pg_restore --list (valida estrutura)
                                  ├── confirma tabelas críticas (User, Course, Enrollment, ...)
                                  └── notifica Telegram
```

**Retenção:** 30 dias de dumps diários (configurável via `BACKUP_RETENTION_DAYS`).  
**Isolamento:** bucket S3 dedicado, região diferente do VPS, credenciais IAM separadas das credenciais da app.

---

## 3. Runbook de Restore — Passo a Passo

### 3.1 — Preparação (fazer ANTES de restaurar)

```bash
# 1. Confirmar acesso ao servidor
ssh deploy@<VPS_HOST>

# 2. Pôr a app OFFLINE para evitar escritas durante o restore
docker compose -f /opt/innova/docker-compose.prod.yml stop app

# 3. Verificar que o Postgres está acessível
psql "$DATABASE_URL" -c "SELECT 1;"

# 4. Criar snapshot manual de segurança do estado actual (se o disco ainda funcionar)
. /opt/innova/.env.production
pg_dump \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --format=custom --compress=9 \
  --file="/tmp/innova_pre_restore_$(date +%Y%m%d_%H%M%S).dump"
```

### 3.2 — Listar backups disponíveis no S3

```bash
. /opt/innova/.env.production
/opt/innova/backup/restore-postgres.sh --list
```

### 3.3 — Restaurar o último backup

```bash
. /opt/innova/.env.production
/opt/innova/backup/restore-postgres.sh latest
# O script pede confirmação explícita antes de apagar dados
```

### 3.4 — Restaurar um backup específico

```bash
. /opt/innova/.env.production
/opt/innova/backup/restore-postgres.sh s3://innova-backups-prod/innova/postgres/2026/07/15/innova_20260715_020000.dump.gpg
```

### 3.5 — Verificar o restore

```bash
# Contagens básicas
psql "$DATABASE_URL" -c "
  SELECT 'User' t, count(*) n FROM \"User\"
  UNION ALL SELECT 'Course', count(*) FROM \"Course\"
  UNION ALL SELECT 'Enrollment', count(*) FROM \"Enrollment\"
  UNION ALL SELECT 'AuditLog', count(*) FROM \"AuditLog\";
"

# Verificar última migration aplicada
psql "$DATABASE_URL" -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

### 3.6 — Reiniciar a app

```bash
docker compose -f /opt/innova/docker-compose.prod.yml start app

# Aguardar health check
for i in $(seq 1 30); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' innova-app 2>/dev/null || echo starting)
  [ "$STATUS" = "healthy" ] && echo "✅ App saudável" && break
  echo "  Aguardar... ($i/30)"
  sleep 3
done

# Smoke test
curl -f https://<DOMAIN>/api/health/ready && echo "✅ Smoke OK"
```

---

## 4. Restore em Staging (Teste Mensal Obrigatório)

Executar o 1º de cada mês contra a BD de staging para confirmar que os backups funcionam:

```bash
# No staging, com DATABASE_URL a apontar para a BD de staging
. /opt/innova-staging/.env.staging
DATABASE_URL="$STAGING_DATABASE_URL" \
  /opt/innova/backup/restore-postgres.sh latest

# Verificar contagens (comparar com produção)
psql "$STAGING_DATABASE_URL" -c "SELECT count(*) FROM \"User\";"
```

Registar no changelog: data, backup usado, contagens antes/depois.

---

## 5. Checklist de Resposta a Incidente

### Primeira hora (contagem regressa)

- [ ] **T+0** — Confirmar natureza do incidente (ransomware / corrupção / hardware)
- [ ] **T+5min** — Isolar o VPS (firewall de emergência, revogar chaves SSH comprometidas)
- [ ] **T+10min** — Confirmar que backups S3 estão intactos e acessíveis
- [ ] **T+15min** — Decidir: restore no mesmo VPS vs. provisionar novo VPS
- [ ] **T+20min** — Comunicar aos stakeholders: incidente activo, ETA estimado
- [ ] **T+30min** — Iniciar restore (seguir secção 3)
- [ ] **T+2h** — App de volta a verde; verificar contagens; smoke test
- [ ] **T+4h** — Notificar utilizadores: "serviço restaurado, dados de X até Y disponíveis"

### Comunicação interna (template)

```
INCIDENTE INNOVA — [DATA] [HORA]
Tipo: [ransomware / corrupção / hardware]
Estado: [Em investigação / A restaurar / Resolvido]
Dados afectados: últimas X horas (desde o backup de [DATA/HORA])
ETA estimado para restauro: [HORA]
Ponto de contacto: [NOME]
```

---

## 6. Segurança do Processo de Backup

| Controlo | Implementação |
|---|---|
| Isolamento do storage | Bucket S3 dedicado, região diferente do VPS |
| Credenciais mínimas | IAM com apenas `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject` sobre o bucket de backup |
| Encriptação em trânsito | HTTPS (aws cli por defeito) |
| Encriptação em repouso | GPG AES-256 com `BACKUP_ENCRYPT_PASSPHRASE` antes do upload |
| Acesso ao passphrase | Só em `.env.production` (chmod 600, fora do git) |
| Rotação de credenciais | IAM key a rodar a cada 90 dias |
| Alertas de falha | Telegram imediato se backup ou verify falhar |
| Teste de restore | Mensal, contra staging (secção 4) |

---

## 7. Política IAM Mínima para o Utilizador de Backup

Criar um utilizador IAM `innova-backup` com APENAS esta policy (não usar root keys):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::innova-backups-prod",
        "arn:aws:s3:::innova-backups-prod/*"
      ]
    }
  ]
}
```

---

## 8. Upgrade Futuro: WAL Archiving (PITR)

O setup actual usa dumps diários (RPO = 24h). Para reduzir RPO para minutos:

1. Activar `archive_mode = on` no `postgresql.conf`
2. Configurar `archive_command` para enviar WAL segments para S3
3. Usar `pg_basebackup` semanal + WAL para Point-in-Time Recovery
4. Ferramenta recomendada: **WAL-G** (open source, S3 nativo, muito mais simples que pgBackRest)

Só necessário se o negócio exigir RPO < 1h. Para o uso interno actual (6000 funcionários, Academia + RH), o RPO de 24h é aceitável.
