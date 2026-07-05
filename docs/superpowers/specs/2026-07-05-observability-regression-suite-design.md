# Observabilidade — Regressão de fluxos críticos (regra 8)

> Data: 2026-07-05
> Repo: backend innova (NestJS 11 + Prisma 7)
> Branch: `feat/observability-regression-suite`
> Origem: requisitos DevOps de monitorização — sub-projeto seguinte às regras 1–7 (fundação pino, health, query logging e métricas Prometheus, já em `main`). Ordem acordada para o resto: **8 → 10 → 9**.

## Contexto

As regras 1–7 estão em `main` (PRs #8–#12). O CI (`quality.yml`) corre lint, build,
unit coverage e testes de integração, mas **nenhum teste exercita a app completa
a correr** — os testes de integração arrancam módulos isolados. Os e2e Playwright
existentes (`test/e2e/`) são full-stack contra o frontend Next.js (`localhost:3000`,
login via UI) e não servem de gate neste repo.

A regra 8 exige uma suite de regressão dos fluxos críticos: se login, cursos,
inscrições ou RBAC partirem, o PR não passa.

## Decisões (brainstorming)

- **Mecanismo:** suite Jest nova que fala **HTTP real** com uma app a correr,
  parametrizada por `SMOKE_BASE_URL` (default `http://localhost:4000`). Escolhida
  em vez de reutilizar as coleções Bruno (potencialmente desatualizadas, runner
  frágil no CI) ou de promover testes de integração (não arrancam a app completa
  nem servem pós-deploy).
- **Dois modos, uma suite:**
  - **CI (gate por PR):** o workflow arranca `node dist/main.js`, espera pelo
    `/health/ready` e corre a suite.
  - **Pós-deploy (regra 10, futuro):** `SMOKE_BASE_URL=https://<prod>` +
    credenciais via env, `SMOKE_SEED=false`, `SMOKE_ALLOW_WRITES=false`.
- **Fluxos críticos (escolha do utilizador):** auth+health, Academia (cursos +
  inscrições) e RH/RBAC. O grupo `/metrics` ficou **fora** por decisão explícita.

## Objetivo

Todo o PR para `main` só passa se os fluxos críticos (login, cursos, inscrições,
RBAC, health) funcionarem na app completa arrancada contra Postgres+Redis reais.
A mesma suite fica pronta para correr contra produção após um deploy (regra 10).

## Design

### 1. Estrutura

```
test/smoke/
  smoke-client.ts          # helper HTTP mínimo (login, get, post)
  critical-flows.smoke.ts  # os 3 grupos de fluxos
  setup.ts                 # globalSetup: seed condicional
test/jest-smoke.json       # config Jest da suite
```

### 2. `smoke-client.ts`

Helper sem dependências novas (usa `fetch` do Node 20):
- `login(email, password)` → `POST /auth/login`, devolve `access_token` (lança se ≠200).
- `get(path, token?)` / `post(path, body, token?)` → devolvem `{ status, body }`
  sem lançar em não-2xx (os testes asserem o status).
- Base URL de `process.env.SMOKE_BASE_URL ?? 'http://localhost:4000'`.

### 3. `critical-flows.smoke.ts` — fluxos

| Grupo | Teste | Assert |
|---|---|---|
| Auth+health | `POST /auth/login` credenciais válidas | 200 + `access_token` presente |
| Auth+health | `POST /auth/login` password errada | 401 |
| Auth+health | `GET /enrollment/my` sem token | 401 |
| Auth+health | `GET /health/live` e `GET /health/ready` | 200 |
| Academia | `GET /courses` (autenticado) | 200 + array |
| Academia | `GET /courses/:id` (id do seed) | 200 + `id` correto |
| Academia | `GET /enrollment/my` | 200 |
| Academia | `POST /enrollment` (curso do seed) | 201; repetida → 409 |
| RH/RBAC | `GET /users` como RH | 200 |
| RH/RBAC | `GET /users` como employee | 403 |
| RH/RBAC | `GET /pdi/my` | 200 |
| RH/RBAC | `GET /attendance/my` | 200 |

- Os testes de **escrita** (`POST /enrollment` + 409) só correm se
  `SMOKE_ALLOW_WRITES !== 'false'` (CI: correm; produção: desligados via env).
- Credenciais e ids vêm de env com defaults alinhados ao seed:
  `SMOKE_EMPLOYEE_EMAIL/PASSWORD`, `SMOKE_RH_EMAIL/PASSWORD`, `SMOKE_COURSE_ID`
  (quando não definido, o setup escreve o id semeado num ficheiro
  `test/smoke/.seed-state.json` lido pela suite).

### 4. `setup.ts` — seed condicional

- Se `SMOKE_SEED === 'false'` → não faz nada (modo pós-deploy).
- Caso contrário (CI/local): reutiliza o padrão de `test/integration/setup.ts` —
  `prisma migrate deploy` tolerante a "já aplicado", depois upsert de:
  roles (`ADMIN`, `RH`, `COLABORADOR`), 1 utilizador employee, 1 utilizador RH
  (campo `fullName`, `roleId` — regras do projeto), 1 curso ativo.
- Grava `{ courseId }` em `.seed-state.json` (gitignored) para a suite usar.

### 5. Config e scripts

- `test/jest-smoke.json`: `testMatch: **/*.smoke.ts`, `globalSetup`, `testTimeout`
  generoso (30 s por teste — a app está noutra máquina no modo pós-deploy).
- `package.json`: `"test:regression": "cross-env NODE_ENV=test jest --config test/jest-smoke.json --runInBand --forceExit"`.

### 6. CI (`quality.yml`)

Passos novos depois de "Testes de integração" (o build e as migrations já
existem no workflow):

1. Arrancar a app compilada em background com env de teste
   (`DATABASE_URL` do service Postgres, `JWT_SECRET`/`JWT_REFRESH_SECRET` de teste,
   `METRICS_TOKEN` dummy, porta 4000).
2. Esperar pelo ready: poll a `http://localhost:4000/health/ready` (curl em loop
   com timeout ~60 s; falha o job com log claro se expirar).
3. `npm run test:regression`.

### 7. Erros e flakiness

- Cada teste assere status + campo essencial (não snapshots) — resiliente a
  campos novos nas respostas.
- `--runInBand` e dependências mínimas entre testes (só o login partilhado por
  grupo via `beforeAll`).
- Falha de arranque da app → falha no passo de wait, não timeouts espalhados.

## Critério de sucesso

1. `npm run test:regression` local (app a correr + BD de teste) → verde.
2. Passo novo no `quality.yml` → CI verde com a suite a correr contra a app real.
3. Partir de propósito um fluxo (ex.: guard errado) → a suite apanha (verificação manual durante o desenvolvimento).
4. A suite corre contra um URL remoto só com env (`SMOKE_BASE_URL`, `SMOKE_SEED=false`, `SMOKE_ALLOW_WRITES=false`, credenciais) — sem alterações de código.

## Fora de âmbito

- Grupo `/metrics` na suite (decisão do utilizador).
- Playwright/UI (repo frontend), performance (Artillery já cobre).
- Execução pós-deploy real e wiring no pipeline de deploy — regra 10 (próximo sub-projeto).
- Alertas (regra 9, último sub-projeto).
