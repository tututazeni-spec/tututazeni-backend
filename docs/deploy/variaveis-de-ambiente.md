# Variáveis de ambiente — referência

> Fonte de verdade do que **bloqueia o arranque**: `src/config/env.validation.ts` (esquema Joi) e `src/common/bootstrap/validate-env.ts` (regras extra em produção).
> Modelos para preencher: `.env.example` (desenvolvimento) e `ops/.env.production.example` (VPS, `/opt/innova/.env.production`, `chmod 600`).
> Este documento explica **para que serve cada grupo, quem o define e o que acontece se faltar**. Se mudares uma variável no código, actualiza-o no mesmo PR.

Legenda — **Obrigatória**: a app não arranca sem ela. **Aviso**: arranca, mas regista um aviso no boot. **Opcional**: sem ela a funcionalidade fica desligada.

## 1. Núcleo (sem isto a app não arranca)

| Variável | Estado | Como gerar / exemplo | Notas |
|---|---|---|---|
| `NODE_ENV` | Obrigatória em produção | `production` | Activa todas as regras da secção 2 |
| `PORT` | Omissão `4000` | — | Não é publicada no host; o Caddy fala com as réplicas pela rede Docker |
| `DATABASE_URL` | Obrigatória | `postgresql://USER:PASS@HOST:5432/innova` | Destino real; `migrate`, backups e exporter usam esta. Recusada em produção com utilizador `postgres/root/admin` ou credenciais por defeito |
| `DATABASE_POOLER_URL` | Opcional | `…@pgbouncer:6432/innova` | A app liga-se aqui quando existe PgBouncer |
| `JWT_SECRET` | Obrigatória (≥ 32 car.) | `openssl rand -base64 48` | Recusa `your_jwt_secret`, `CHANGE_ME` e valores de teste |
| `JWT_REFRESH_SECRET` | Obrigatória (≥ 32 car.) | idem | **Tem de ser diferente** de `JWT_SECRET` (aviso se igual) |
| `ALLOWED_FILE_HOST` | Obrigatória | `storage.innova.ao,cdn.innova.ao` | Domínios autorizados para `fileUrl` |
| `ALLOWED_ORIGINS` | Obrigatória | `https://app.exemplo.ao` | Lista CORS separada por vírgulas; em produção só `https://` e nunca `localhost` |
| `APP_URL` | Obrigatória | `https://innova.exemplo.ao` | Base dos links de certificados, QR, reset de senha. Em produção tem de começar por `https://` |
| `METRICS_TOKEN` | Obrigatória | `openssl rand -hex 32` | Protege `/metrics`; o `deploy.sh` reutiliza-o para o scrape do Prometheus |

## 2. Só em produção (`NODE_ENV=production`)

| Variável | Estado | Efeito se faltar |
|---|---|---|
| `SWAGGER_TOKEN` | Obrigatória | Boot falha. Protege `GET /docs` |
| `PASSWORD_PEPPER` | Obrigatória (≥ 32 car.) | Boot falha. Segredo **fora da BD** aplicado antes do Argon2id. **Nunca mudar depois de definido** (invalida todas as senhas) |
| `PII_ENCRYPTION_KEY` | Aviso (obrigatória na prática) | Sem ela, NIF/NIB/IBAN/segredos de webhook são cifrados com chave derivada de `JWT_SECRET` — rodar o JWT torna-os ilegíveis. **Guardar fora do servidor; perdê-la = dados perdidos** |
| `REDIS_PASSWORD` | Aviso (obrigatória no compose) | Redis (filas, throttler, cache) sem autenticação; o compose arranca-o com `--requirepass` |
| `RLS_ENABLED` | Aviso se ≠ `true` | A app corre com a role dona das tabelas, sem isolamento por linha (`ops/db/rls/README.md`) |
| `DATABASE_APP_URL` | Obrigatória com `RLS_ENABLED=true` | Role `innova_app` (NOBYPASSRLS), via PgBouncer |
| `CSRF_TOKEN_STRICT` | Omissão `false` | Passar a `true` após a janela de 7 dias (`docs/seguranca-pendentes.md`) |
| `SEED_ADMIN_PASSWORD` | Recusa valores conhecidos | `Admin@1234`, `Employee@1234`, `LoadTest@2024` fazem o boot falhar |

## 3. Autenticação e sessão

| Variável | Omissão | Notas |
|---|---|---|
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `7d` | |
| `SESSION_IDLE_TIMEOUT_MS` | `1800000` (30 min) | Sessão inactiva é terminada no próximo refresh |
| `AUTH_ALLOW_BEARER` | `false` em produção | `true` só para clientes legados/Swagger |
| `JWT_USER_CACHE_TTL_MS` | `30000` | Cache do utilizador no guard JWT |
| `FRONTEND_URL` | — | Links em e-mails; igual ao domínio público do frontend |

## 4. Base de dados avançada

| Variável | Omissão | Notas |
|---|---|---|
| `DB_POOL_MAX` | `50` | Em `.env.test` tem de ser baixo (`5`) — ver `CLAUDE.md` |
| `USE_REPLICAS`, `DATABASE_REPLICA_URL`, `DATABASE_REPLICA_APP_URL`, `DB_REPLICA_POOL_MAX` | `false` / — / — / `10` | Leitura em réplica; rollback = `USE_REPLICAS=false` (`docs/db-architecture/`) |
| `DATA_SOURCE_NAME` | — | Utilizador `pg_monitor` só-leitura, ligação **directa** ao primary, para o postgres-exporter |
| `DB_SSL_CA` | — | PEM do CA do Postgres gerido; com ele a app valida o certificado. Usar `\n` no lugar das quebras de linha |
| `SLOW_QUERY_LOG` | desligado | `true` regista queries lentas |
| `RLS_PRIVILEGED_ROLES` | `ADMIN,RH,DIRECTOR,GESTOR,LIDER,AUDITOR,INSTRUCTOR` | Papéis que atravessam o RLS |

## 5. Redis, filas e cache

| Variável | Omissão | Notas |
|---|---|---|
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` em produção | |
| `QUEUE_ENABLED` | `true` | Filas Bull (e-mails, webhooks, auditoria) |
| `CACHE_ENABLED` | `true` | Cache Redis |

## 6. Ficheiros e uploads

| Variável | Omissão | Notas |
|---|---|---|
| `STORAGE_BASE_URL` | — (aviso) | URL base do storage (R2/S3); sem ela, URLs de DOCX podem falhar |
| `IMG_ALLOWED_HOSTS` | vazio = qualquer `https` | **Inseguro em produção se vazio.** Tem de coincidir com a variável do repositório do frontend (build-arg) |
| `UPLOAD_VALIDATION_MODE` | `enforce` | `warn` só durante rollout (gera aviso no boot). Valor inválido faz o boot falhar |
| `UPLOAD_THROTTLE_LIMIT` | `20` | Uploads/utilizador/minuto |
| `CLAMAV_ENABLED`, `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_TIMEOUT_MS`, `CLAMAV_FAIL_MODE`, `CLAMAV_MAX_BYTES` | `false` / — / — / — / `open` / 25 MiB | Antivírus opcional; `closed` recusa o upload se o clamd estiver em baixo |
| `REMOTE_FILE_VERIFY`, `REMOTE_FILE_FAIL_MODE`, `REMOTE_FILE_MAX_BYTES`, `REMOTE_FILE_SYNC_MAX_BYTES`, `REMOTE_FILE_TIMEOUT_MS`, `REMOTE_FILE_CACHE_TTL_S`, `REMOTE_FILE_SWEEP*` | `false` / `open` / … | Verificação dos ficheiros já guardados no storage. Detalhe em `ficheiros-e-persistencia.md` |

## 7. E-mail

Há **dois conjuntos diferentes**, ambos têm de estar preenchidos:

| Conjunto | Variáveis | Lê |
|---|---|---|
| Da aplicação (convites, reset, notificações) | `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, **`SMTP_PASS`**, `SMTP_FROM` | NestJS |
| Dos alertas | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, **`SMTP_PASSWORD`**, `ALERT_EMAIL_TO` | Alertmanager |

O domínio de `SMTP_FROM` precisa de SPF, DKIM e DMARC — `dns-e-email.md` e `npm run ops:dns-check`.

## 8. Alertas e observabilidade

| Variável | Estado | Notas |
|---|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Obrigatórias para alertas | Também usadas nas notificações de deploy |
| `HEALTHCHECKS_PING_URL` | Obrigatória | Dead-man externo (`alerting.md`) |
| `SLACK_WEBHOOK_URL` | Opcional | Vazio = desligado |
| `ALERT_SMS_TO` | Opcional | Números E.164 separados por vírgulas; só alertas críticos; reutiliza `TWILIO_*` |
| `LOG_LEVEL` | `info` | `trace`…`fatal` |
| `ENABLE_OBSERVABILITY`, `GF_SECURITY_ADMIN_PASSWORD` | `false` / — | Grafana + Loki + Promtail (+≈ 640 MB RAM; só VPS de 8 GB) |
| `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` | vazio / `0` | Vazio = Sentry desligado |
| `BUILD_SHA` | `unknown` | Injectado pelo `deploy.sh`; aparece em `GET /health` |

## 9. Backups

| Variável | Notas |
|---|---|
| `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX` | Bucket dedicado (idealmente noutra região) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_ENDPOINT` | IAM só com `s3:PutObject/GetObject/ListBucket/DeleteObject`, **não** as credenciais da app. `AWS_ENDPOINT` vazio = AWS; R2/B2/MinIO preenchem-no |
| `BACKUP_RETENTION_DAYS` | `30` |
| `BACKUP_ENCRYPT_PASSPHRASE` | `openssl rand -base64 32`. Sem ela o dump sobe **sem cifra**. Guardar fora do servidor |
| `BACKUP_MAX_AGE_HOURS` | `26` — acima disto dispara `BackupTooOld` |

## 10. Borda e frontend

| Variável | Notas |
|---|---|
| `DOMAIN` | Tem de bater com o SNI do certificado Origin CA e com o hostname na Cloudflare |
| `ACME_EMAIL` | Já não é usado (`auto_https` desligado); só no ensaio local sem Cloudflare |
| `FRONTEND_IMAGE_TAG` | Tag no GHCR; o `deploy.sh` sobrepõe-na a cada rollout |
| `API_INTERNAL_URL` | `http://app:4000` — SSR/route handlers do Next dentro da rede Docker |

## 11. Funcionalidades opcionais (sem a chave, a funcionalidade responde 503 ou fica escondida)

| Funcionalidade | Variáveis |
|---|---|
| IA Tutor | `AI_PROVIDER` (`groq`\|`gemini`\|`ollama`), `GROQ_API_KEY`, `GROQ_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OLLAMA_URL`, `OLLAMA_MODEL` |
| Voz do tutor | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` |
| Avatar | `SIMLI_API_KEY`, `SIMLI_FACE_ID`, `SIMLI_ALLOWED_ROLES`, `SIMLI_MAX_SESSION_SECONDS` (600), `SIMLI_MAX_IDLE_SECONDS` (180) |
| Videoconferência | `JITSI_APP_SECRET` |
| Suporte ao cliente | `SUPPORT_EMAIL`, `STATUS_PAGE_URL` — definir **antes** de anunciar o suporte (`docs/suporte/canais-e-base-de-conhecimento.md`) |

## 12. Como verificar antes de um deploy

```bash
npm run preflight:golive      # só leitura; reporta FALHA/AVISO por variável e por storage
npm run ops:dns-check         # SPF, DKIM, DMARC, A
```

Regras práticas:

1. Nenhum segredo vai para o Git. O `.env.production` vive só no VPS (`chmod 600`) e a cópia de segurança dos segredos que **não se podem perder** (`PII_ENCRYPTION_KEY`, `PASSWORD_PEPPER`, `BACKUP_ENCRYPT_PASSPHRASE`) fica num cofre de passwords, fora do servidor.
2. Variável nova no código → entra no esquema Joi, no `.env.example`, no `ops/.env.production.example` **e** nesta tabela.
3. Rodar `JWT_SECRET`/`JWT_REFRESH_SECRET` termina todas as sessões (aceitável, planeado). Rodar `PII_ENCRYPTION_KEY` ou `PASSWORD_PEPPER` sem migração **destrói dados / invalida senhas** — nunca sem plano.
