# Notas de Release — INNOVA v1.0.0

> Data: 2026-06-17 · Tipo: **Major** (primeira versão estável)
> Âmbito: entrega dos **9 módulos corporativos** (backend + frontend)

---

## 1. Resumo

Esta release adiciona 9 módulos completos à plataforma INNOVA. É **aditiva**: não altera
nem remove tabelas existentes; introduz novas tabelas, enums e relações inversas no `User`.

| Indicador | Valor |
|---|---|
| Módulos novos | 9 |
| Migrações Prisma | 9 (todas aditivas) |
| Testes (suite global) | 200 suites · 3304 testes · 0 falhas |
| Cobertura global | 71,35% linhas |
| Bruno (E2E API) | 9/9 colecções verdes |
| Build `tsc` | 0 erros |

**Repositórios:**
- Backend: `tututazeni-backend` (NestJS + Prisma + PostgreSQL) — porta `4000`
- Frontend: `tututazeni-frontend` (Next.js) — porta `3000`

---

## 2. Pré-requisitos

- Node.js (mesma versão do ambiente actual) e npm.
- PostgreSQL acessível (variável `DATABASE_URL`).
- Acesso de escrita à base de dados para correr as migrações.
- Janela de manutenção curta recomendada (as migrações são rápidas, mas há 9).

### Variáveis de ambiente
- Backend: `DATABASE_URL`, `JWT_SECRET` (e `JWT_USER_CACHE_TTL_MS` opcional).
- Frontend: `NEXT_PUBLIC_API_URL` (proxy `/api` → backend) — já configurado via
  `next.config.ts` (`/api/:path*` → `http://localhost:4000/:path*`).

> Nota: esta release **não introduz novas variáveis de ambiente obrigatórias**.

---

## 3. Runbook de Deploy

### 3.1 Backend

```bash
# 1. Obter a versão
git fetch origin && git checkout main && git pull

# 2. Instalar dependências
npm ci

# 3. Gerar o Prisma Client
npx prisma generate

# 4. Aplicar as migrações em produção (NÃO usar migrate dev)
npx prisma migrate deploy

# 5. Compilar
npm run build           # tsc → deve terminar com 0 erros

# 6. Arrancar (ou reiniciar o serviço/PM2/container)
node dist/main.js
```

> **Migrações:** em produção usa-se sempre `prisma migrate deploy` (aplica as migrações
> pendentes por ordem, sem shadow DB nem prompts). As 9 migrações desta release estão
> listadas no `CHANGELOG.md`.
>
> Se o `migrate deploy` der `P1001` por causa de query params no `DATABASE_URL`
> (`?connection_limit=...`), aplicar com a URL sem query params:
> `npx prisma migrate deploy --url "postgresql://USER:PASS@HOST:5432/DB"`.

### 3.2 Frontend (repo separado)

```bash
git fetch origin && git checkout main && git pull
npm ci
npm run build           # next build
npm run start           # ou reiniciar o serviço
```

---

## 4. Verificação pós-deploy (smoke tests)

```bash
# Saúde / autenticação
curl -i -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@innova.com","password":"<senha>"}'   # 201 + accessToken

# Endpoints novos (com Bearer token):
GET  /crm/beneficiaries?page=1&limit=20
GET  /crm/partners?page=1&limit=20
GET  /crm/funders?page=1&limit=20
GET  /library/items?page=1&limit=20
GET  /certification/verify/<codigo>          # PÚBLICO (sem token)
GET  /dashboard-institutional/summary
GET  /academic/programs?page=1&limit=20
GET  /lms/paths?page=1&limit=20
GET  /monitoring/dashboard
```

Frontend — confirmar acesso às novas páginas:
`/crm/beneficiaries`, `/crm/partners`, `/crm/funders`, `/library`, `/certificates`,
`/verify/<codigo>` (público), `/dashboard/institutional`, `/academic/programs`,
`/lms/paths`, `/monitoring/okrs`.

### Verificação E2E opcional (Bruno)
```bash
cd bruno && npx bru run monitoring --env local   # (e restantes colecções)
```

---

## 5. Rollback

A release é aditiva, por isso o rollback de **código** é seguro (volta-se ao commit
anterior e reinicia-se). Quanto à base de dados:

```bash
# Código
git checkout <tag-ou-commit-anterior> && npm ci && npm run build && reiniciar

# Base de dados (apenas se for mesmo necessário)
# As novas tabelas ficam órfãs mas NÃO afectam o funcionamento da versão anterior,
# porque nenhuma tabela existente foi alterada. Recomenda-se DEIXAR as tabelas novas.
# Reverter migrações implica DROP manual das tabelas/enums novos (operação destrutiva,
# fazer só com backup e fora de horas).
```

> Recomendação: como o esquema é puramente aditivo, em caso de problema reverte-se só o
> **código**; as tabelas novas podem permanecer sem efeitos colaterais.

---

## 6. Riscos e mitigação

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Falha numa das 9 migrações a meio | Baixa | `migrate deploy` é transaccional por migração; correr com backup; aplicar `--url` se P1001 |
| Rota pública `/verify/:code` exposta indevidamente | Baixa | É intencional (verificação de certificados); não devolve dados sensíveis, só validade |
| Conflito de nomes com módulos existentes | Mitigado | Resolvido em build (Gender reutilizado; `InstitutionalSnapshot`; prefixo `Lms`) |
| Aumento de LOC vs limite SonarCloud | Médio | Validar quota no CI após o merge |

---

## 7. Permissões / Roles

Os endpoints de gestão usam `@Roles('ADMIN','RH','MANAGER')` conforme o caso; rotas
"my-*" (meus certificados, meus percursos, minhas avaliações) requerem apenas
autenticação. A verificação de certificados (`/certification/verify/:code`) é pública.

---

*INNOVA v1.0.0 — 9 módulos corporativos · NestJS + Prisma + PostgreSQL + Next.js*
