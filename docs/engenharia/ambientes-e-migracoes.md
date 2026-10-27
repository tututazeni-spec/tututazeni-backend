# Ambientes, migrações, testes e documentação

## Ambientes

| Ambiente | Onde | BD | Configuração | Como recebe código |
|---|---|---|---|---|
| Desenvolvimento | máquina local, `npm run start:dev` (porta 4000) | Postgres local `innova_dev` | `.env` (a partir de `.env.example`) | ramo de trabalho |
| Testes (CI/local) | GitHub Actions / local | `innova_test`, descartável | `.env.test` (`DB_POOL_MAX=5`) | cada PR (`quality.yml`) |
| Staging | stack de pré-produção (opcional, `HAS_STAGING`) | BD própria, **nunca** a de produção | segredos do ambiente `staging` no GitHub | `deploy.yml`, job `staging` (health gate + smoke) |
| Produção | VPS + Docker Compose (`ops/docker-compose.prod.yml`) ou K8s (`ops/k8s/`) | Postgres gerido, via PgBouncer | `/opt/innova/.env.production` (nunca no git) | `deploy.yml`, só depois do staging passar |

Regras: segredos nunca vão para o git (gitleaks no CI); cada ambiente tem os seus; produção só recebe imagens `sha-<commit>` que já passaram CI + Trivy (+ staging).
Arquitectura e fluxo completos: `docs/deploy/arquitetura-producao.md`; operação: `docs/deploy/runbook.md`.

## Migrações de base de dados

- Fonte de verdade: `prisma/migrations/` (versionada no git) + `prisma/schema.prisma`.
- **Desenvolvimento**: alterar o schema e gerar a migration; commit do schema e da migration **juntos**. Sem TTY, `prisma migrate dev` falha: usar `prisma migrate diff` e criar a migration à mão.
- **Staging/produção**: apenas `prisma migrate deploy`, executado pelo job one-shot `migrate` antes das réplicas arrancarem. Se falhar, nada arranca.
- **CI**: `npx prisma migrate deploy` contra uma BD limpa em cada PR prova que o histórico completo aplica.
- **Nunca**: `prisma db push`, `migrate reset`, DDL manual (`psql`) ou editar uma migration já aplicada em qualquer ambiente. `db:push` e `db:reset` existem só para BD local descartável.
- **Expand/contract** para deploy sem janela: (1) migration aditiva (coluna nullable/tabela nova) com código que tolera ambos os estados; (2) backfill; (3) numa release posterior, remover o antigo. Migrations destrutivas exigem backup prévio e janela (ver `runbook.md`).
- Erro tipo "Unknown argument" num campo: confirmar `npx prisma migrate status`, `npx prisma generate` e reiniciar o processo, antes de assumir que falta o campo.
- Backfills de dados vão em migration SQL ou script versionado em `scripts/`, nunca executados à mão.

## Testes

| Tipo | Comando | Onde corre |
|---|---|---|
| Unitários | `npm run test` | CI (com cobertura) |
| Autorização | `npm run test:authz` | CI |
| Integração (Postgres real) | `npm run test:integration` | CI |
| BD (integridade/performance) | `npm run test:db` | local, sob pedido |
| Regressão de fluxos críticos (app arrancada) | `npm run test:regression` | CI e smoke pós-deploy em produção |
| E2E UI (Playwright) | `npm run test:e2e` | local, requer frontend a correr |
| Carga (Artillery) | `npm run test:load` | local/staging, nunca produção |

## Documentação

- API: Swagger em `/docs` (protegido por autenticação), gerado dos decorators `@nestjs/swagger`; colecção Bruno em `bruno/`.
- Arquitectura e deploy: `docs/deploy/` (`arquitetura-producao`, `runbook`, `disaster-recovery`, `observabilidade`, `alerting`, `ha-and-spof`, `multi-tenancy-e-escala`); base de dados: `docs/db-architecture/`.
- Segurança e compliance: `docs/security/`.
- Fluxo de código: `CONTRIBUTING.md`.
