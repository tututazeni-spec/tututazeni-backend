# Auditoria da base de dados para produção (2026-10-27)

Verificado por leitura de código/configuração; **nenhum teste foi corrido** (aguardam autorização).

| # | Ponto | Estado | Onde / o que mudou |
|---|---|---|---|
| 1 | Migrações testadas num ambiente igual ao de produção | Existia + **reforçado** | CI aplica `prisma migrate deploy` numa BD limpa (Postgres 16) e verifica drift; staging com BD própria (`docs/engenharia/ambientes-e-migracoes.md`); job `migrate` one-shot antes das réplicas. **Novo:** `restore-drill.sh` aceita `DRILL_MIGRATE_IMAGE` e aplica `migrate deploy` sobre a cópia **real** restaurada, não só sobre BD vazia |
| 2 | Dados de teste removidos; dados iniciais carregados | Existia + **reforçado** | `prisma/seed.ts` em produção exige `SEED_ADMIN_PASSWORD`, não cria a conta de teste; carrega roles, tipos de licença, `CountryConfig`/IRT, competências, KPIs; `BillingPlansService.onModuleInit` semeia os planos. **Novo:** o restore drill avisa (Telegram) se a BD real tiver `@innova-test.com` / `load.test.*` |
| 3 | Índices nas consultas mais frequentes | Existia + **2 em falta fechados** | Varrimento das FKs do schema: só 19 sem índice (todas "criado por"/baixa frequência). Migration `20261206000000` indexa `billing_subscriptions.planId` e `AttendanceAdjustment.adjustedById`. Restantes 17 deixadas de propósito (tabelas pequenas, sem filtro por essa coluna) |
| 4 | Backups automáticos | Existe | `ops/backup/install-cron.sh` (dump cifrado → S3, `verify-backup.sh`, métricas + alerta) |
| 5 | Restauro testado | Existe | `ops/backup/restore-drill.sh`, cron mensal dia 1 às 05:00, alerta `RestoreDrillTooOld`. **Confirmar** que correu pelo menos uma vez em produção |
| 6 | Utilizador da BD com permissões mínimas | Existia (RLS) + **forçado** | Role `innova_app` (sem BYPASSRLS) em `ops/db/rls/`; migrate/backup com a role dona. **Novo:** `validateEnv` recusa em produção `DATABASE_URL`/`DATABASE_APP_URL` com `postgres`/`root`/`admin`; `PrismaService` recusa arrancar em produção se a role for SUPERUSER (válvula `ALLOW_SUPERUSER_DB=true`). Aviso no boot se `RLS_ENABLED` não for `true` |
| 7 | Dados sensíveis encriptados | Parcial → **completado** | Já cifrados: `User.nif/nib`, `twoFactorSecret`, segredos de SSO/WhatsApp/integrações. **Novo:** `EmployeeCompensation.iban/accountNumber` e `Webhook.secret` (AES-256-GCM, `pii-crypto.ts`). Leitura tolera claro legado; backfill: `npx ts-node prisma/backfill-encrypt-secrets.ts [--dry-run]`. Aviso se `PII_ENCRYPTION_KEY` não estiver definida |

## Acções manuais antes do go-live
Verificação automática (só leitura, contra a BD de produção): `npm run preflight:golive` — lista o que falta e sai com código 1 se houver bloqueantes. Backfill de cifra: `npm run backfill:pii`.

1. Definir `PII_ENCRYPTION_KEY` própria e, **depois**, correr `backfill-encrypt-user-pii.ts` e `backfill-encrypt-secrets.ts`.
2. Em produção: criar a role `innova_app` (`ops/db/rls/01_rls_harden.sql`), definir `DATABASE_APP_URL` e `RLS_ENABLED=true` (RLS ainda com smoke autenticado pendente).
3. Correr uma vez `restore-drill.sh` com `DRILL_MIGRATE_IMAGE=<imagem candidata>` e confirmar ausência de avisos de utilizadores de teste.
4. Encriptação em repouso do disco/volume da BD e dos backups: depende do fornecedor do Postgres gerido — **confirmar** no painel (os dumps já vão cifrados com `BACKUP_ENCRYPT_PASSPHRASE`).

## Limites
- Cifrar `iban` impede pesquisa por valor na BD (ninguém pesquisa por IBAN no código).
- Os specs que mockam `Webhook.create` precisam de `PII_ENCRYPTION_KEY`/`JWT_SECRET` definido (cifra síncrona); não corridos.
