# Auditoria e Hardening de Autenticação/Autorização — Plano

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** Fechar as lacunas de autenticação, revogação de sessão, autorização por papel/permissão e isolamento administrativo, aplicando menor privilégio.

**Arquitetura:** Manter os guards globais existentes (`JwtAuthGuard` → `RolesGuard` → `ThrottlerGuard`, `src/app.module.ts:237-239`). Passar `RolesGuard` para um modelo explícito (deny-by-default opt-out), acrescentar revogação de access token por sessão e um guard/prefixo para a superfície administrativa.

**Tech Stack:** NestJS, Passport-JWT, Prisma/PostgreSQL, Jest (unit + `test/integration`).

**Spec:** este documento (resultado da auditoria abaixo).

## Global Constraints

- `User.fullName`, `roleCode` para filtrar roles (nunca string `role`), conforme CLAUDE.md.
- Confirmar campos/modelos Prisma em `prisma/schema.prisma` antes de usar (regra 11); migrations só via `migrate diff` + migration manual (não há TTY).
- Commits locais, Conventional Commits, sem push/merge a `main` (CI `quality` obrigatório).
- Não alterar contratos HTTP existentes sem teste de integração a cobrir o 401/403 novo.

---

## 1. Resultado da auditoria

### O que já está bem
| Área | Evidência |
|---|---|
| Autenticação por omissão | `JwtAuthGuard` global (`src/common/guards/jwt-auth.guard.ts`); só `@Public()` salta. Fail-closed. 87 controllers, só 1 sem guard explícito (`mobile`) mas coberto pelo global. |
| Expiração | `ignoreExpiration: false` (`jwt.strategy.ts`); access 15 min, refresh 7 d. |
| Refresh | Rotação, hash SHA-256 em BD, reuse-detection revoga a cadeia, limite de inatividade (`auth.service.ts:486-560`). |
| Pós-troca de password | Access token anterior a `passwordChangedAt` é rejeitado. |
| Utilizador inativo | `loadUser` rejeita `!active`. |
| Rotas públicas | Apenas auth, SSO, health, `/metrics` (token próprio fail-closed), verify de certificado (com throttle). |
| Ownership | `assertCanAccess`/`isPrivileged` em 58 ficheiros; `mobile.updatePushToken` filtra por `{id, userId}`. |

### Achados (por severidade)

| # | Sev. | Achado | Local |
|---|---|---|---|
| F1 | **Alta** | `RolesGuard` é **fail-open**: sem `@Roles` devolve `true`. Num total de ~2150 handlers, cobertura de `@Roles` é por ficheiro (81 de 87 controllers), mas esquecer o decorador num endpoint novo/existente concede acesso a qualquer autenticado. A autorização real fica toda dependente de checks manuais no serviço. | `src/common/guards/roles.guard.ts:11-14` |
| F2 | **Alta** | **Access token não é revogável.** `logout` limpa cookies e revoga só o refresh; o JWT (15 min) continua válido se copiado. Não há `jti`/denylist/`tokenVersion`. Desativar utilizador ou mudar role demora até `JWT_USER_CACHE_TTL_MS` (30 s) e o cache é por processo (2 instâncias no edge → incoerência). | `auth.controller.ts:96-107`, `jwt.strategy.ts:35-79` |
| F3 | **Alta (verificar)** | O cookie de refresh tem `path: '/api/auth/refresh'`; o browser **não envia** esse cookie a `/api/auth/logout`, por isso `revokeRefreshToken` provavelmente nunca corre no logout real e o refresh token sobrevive 7 dias. Confirmar com teste E2E/browser. | `token-cookie.ts:33-47`, `auth.controller.ts:100-103` |
| F4 | Média | **Inatividade só aferida no refresh** e medida desde `createdAt` do refresh token, não desde a última atividade. Com access de 15 min o efeito é aproximado, mas não há inatividade real nem timeout absoluto de sessão. Cookie `token` tem `maxAge` 7 d (JWT expira antes → ruído). | `auth.service.ts:525-535` |
| F5 | Média | `AUTH_ALLOW_BEARER` por omissão `true`: Bearer em header aceite em produção (superfície XSS/log de token). | `jwt.strategy.ts:21-22,52` |
| F6 | Média | `RolesGuard` compara `user.role.name` (nome livre/display) em vez de `roleCode`; sem noção de **permissões** apesar de existir `RolePermission` M2M. Arrays de roles repetidos por controller (drift conhecido). | `roles.guard.ts:16` |
| F7 | Média | **Sem isolamento administrativo**: não há prefixo/guard `admin`; `settings`, `audit`, `scalability`, `monitoring`, `api-integrations` misturam rotas "qualquer utilizador" (ex. `GET /settings/branding`) e ADMIN no mesmo controller, protegidas só por `@Roles` por handler. | `settings.controller.ts`, `audit/*`, `scalability/*` |
| F8 | Média | Endpoints públicos sem `@Throttle` próprio: `declarations/verify/:code`, `work-declaration/verify/:code`, `document-repository/share/:token` (**password em query string** → fica em logs/histórico). Enumeração de códigos e brute-force da password do link. | `declarations.controller.ts:183`, `work-declaration.controller.ts:253`, `document-repository.controller.ts:129` |
| F9 | Baixa | `MetricsTokenGuard` compara com `===` (não timing-safe). Swagger só protegido se `SWAGGER_TOKEN` definido. | `metrics-token.guard.ts:11` |
| F10 | Baixa | Dois `JwtAuthGuard` (`src/auth/jwt-auth.guard.ts` sem `@Public`/RLS, e `src/common/guards/`). `AuthController` usa o de `auth/` em `@UseGuards` — redundante e confuso. | `auth.controller.ts:18,112,134` |
| F11 | Baixa | Ownership (IDOR) não verificável de forma exaustiva por grep; histórico mostra lacunas (`approvePlan`). Não existe teste que falhe quando um handler `:id` não chama a verificação. | transversal |

---

## 2. Tarefas e subtarefas

Ordem recomendada: T1 → T2 → T3 (críticas), depois T4–T8 em paralelo, T9 por último.

### Task 1: Corrigir logout e revogação do refresh (F3)

**Files:** Modify `src/auth/token-cookie.ts`, `src/auth/auth.controller.ts`; Test `src/auth/token-cookie.spec.ts`, `test/integration/auth-logout.integration-spec.ts` (novo)

**Interfaces:** Produces: `logout` revoga a sessão independentemente do path do cookie.

- [ ] 1.1 Reproduzir: teste de integração (supertest com cookie jar respeitando `Path`) que faz login, chama `POST /auth/logout` e espera `refreshToken.revokedAt != null`. Esperado hoje: FAIL se F3 se confirmar.
- [ ] 1.2 Alargar `buildRefreshCookieOptions.path` para `/api/auth` (cobre `refresh` e `logout`), ou ler o refresh pelo `req.user` do access token quando o cookie faltar.
- [ ] 1.3 Em `logout`, se não houver cookie de refresh mas houver sessão (`userId` do access token), revogar todas as sessões ativas desse refresh family do utilizador.
- [ ] 1.4 Atualizar `token-cookie.spec.ts` para o novo `path`; limpar o cookie com o mesmo `path` no `clearCookie`.
- [ ] 1.5 Correr integração completa + commit `fix(auth): logout revoga refresh token`.

### Task 2: Revogação de access token e coerência de cache (F2)

**Files:** Modify `prisma/schema.prisma` (+ migration manual), `src/auth/auth.service.ts`, `src/auth/jwt.strategy.ts`; Test `src/auth/jwt.strategy.spec.ts`, integração

**Interfaces:** Produces: claim `sid` (id da sessão/refresh family) no access token; `AuthService.revokeSession(sid)`.

- [ ] 2.1 Teste: access token emitido, logout, mesmo token → 401 (hoje 200).
- [ ] 2.2 Teste: desativar utilizador / mudar `roleId` → próximo pedido recusado/atualizado em < 1 s (cache invalidado).
- [ ] 2.3 Adicionar `User.tokenVersion Int @default(0)` (confirmar em `schema.prisma`) e claim `tv` no token; `validate()` rejeita `tv !== user.tokenVersion`. Incrementar em logout-all, mudança de role, desativação, reset de password.
- [ ] 2.4 Mover o cache de utilizador para Redis (já existe no stack) com invalidação por `DEL` no incremento, ou reduzir TTL para ≤ 5 s com `tokenVersion` verificado fora do cache. Decidir e documentar.
- [ ] 2.5 Opcional: denylist Redis por `jti` com TTL = vida restante, para logout imediato de uma sessão sem tocar noutras.
- [ ] 2.6 Migration manual (`migrate diff`), `prisma generate`, reiniciar o processo na 4000; commit.

### Task 3: RolesGuard deny-by-default + permissões (F1, F6)

**Files:** Modify `src/common/guards/roles.guard.ts`, `src/common/decorators/roles.decorator.ts`; Create `src/common/decorators/authenticated-only.decorator.ts` (`@AnyAuthenticated()`), `src/common/guards/permissions.guard.ts`; Test `roles.guard.spec.ts`, `test/integration/authz-coverage.integration-spec.ts`

**Interfaces:** Produces: `@AnyAuthenticated()` (opt-out explícito), `@RequirePermission(code: string)`; `RolesGuard` nega se não houver `@Roles`, `@RequirePermission`, `@AnyAuthenticated` nem `@Public`.

- [ ] 3.1 **Inventário primeiro (sem mudar comportamento):** script `scripts/audit-authz-coverage.ts` que usa `DiscoveryService`/`Reflector` para listar todo handler sem `@Roles`/`@Public`. Saída em `docs/security/authz-coverage.md`.
- [ ] 3.2 Para cada handler listado classificar: (a) self-scoped → `@AnyAuthenticated()`, (b) restrito → `@Roles`/`@RequirePermission`. Rever em lotes por módulo (mobile, users/qualifications, settings/branding, etc.).
- [ ] 3.3 Teste de integração `authz-coverage`: percorre todas as rotas registadas e falha se alguma não tem metadado de autorização. Passa a ser gate de CI.
- [ ] 3.4 Mudar `RolesGuard` para fail-closed (flag `AUTHZ_DENY_BY_DEFAULT`, ligar primeiro em teste, depois em dev, depois por omissão).
- [ ] 3.5 Comparar por `roleCode` (não `role.name`); centralizar conjuntos de roles em `src/auth/enums/role.enum.ts` (`ROLE_GROUPS.ADMIN_ONLY`, `HR`, `MANAGEMENT`) e substituir arrays locais (drift F6).
- [ ] 3.6 `PermissionsGuard` lê `role.permissions` (já achatado por `withFlatPermissions`) para ações finas (ex.: `settings.write`, `audit.export`).

### Task 4: Isolamento da superfície administrativa (F7)

**Files:** Modify `settings`, `audit`, `scalability`, `monitoring`, `api-integration` controllers; Create `src/common/guards/admin-surface.guard.ts`

- [ ] 4.1 Teste: utilizador COLABORADOR em cada rota admin → 403 (tabela-driven a partir do inventário da T3).
- [ ] 4.2 Separar rotas não sensíveis (`GET /settings/branding`) para um controller `PublicSettingsController`/`@AnyAuthenticated`; o `SettingsController` fica com `@Roles(ADMIN)` ao nível da classe.
- [ ] 4.3 Aplicar `@UseGuards(AdminSurfaceGuard)` (exige ADMIN + sessão recente `auth_time` ≤ 30 min, step-up para ações destrutivas: purge de audit, backups, chaves API).
- [ ] 4.4 Opcional: rate-limit mais apertado e allow-list de IP via `ADMIN_IP_ALLOWLIST` para estas rotas.

### Task 5: Inatividade e política de sessão (F4, F5)

**Files:** Modify `src/auth/auth.service.ts`, `jwt.strategy.ts`, `token-cookie.ts`

- [ ] 5.1 Teste: pedido autenticado atualiza `lastSeenAt`; após `sessionIdleMinutes` sem pedidos, access token ainda válido → 401.
- [ ] 5.2 Guardar `lastSeenAt` na sessão (Redis, escrita no máximo 1×/min) e verificar em `validate()`.
- [ ] 5.3 Medir inatividade do refresh a partir de `lastSeenAt`, não de `createdAt`; adicionar teto absoluto (`SESSION_ABSOLUTE_HOURS`).
- [ ] 5.4 `AUTH_ALLOW_BEARER` por omissão `false` em `NODE_ENV=production`; documentar clientes que dependem (Swagger, mobile).
- [ ] 5.5 Alinhar `maxAge` do cookie `token` com a vida do access token.

### Task 6: Endpoints públicos — anti-enumeração (F8)

**Files:** `declarations.controller.ts`, `work-declaration.controller.ts`, `document-repository.controller.ts`

- [ ] 6.1 Teste: >30 pedidos/min a cada `verify/:code` → 429.
- [ ] 6.2 Aplicar `@Throttle({ default: { limit: 30, ttl: 60_000 } })` (mesmo padrão de `PublicCertificatesController`).
- [ ] 6.3 `share/:token`: passar a `POST` com `{ password }` no body (manter GET sem password para links sem proteção); throttle estrito (5/min por token+IP) e atraso/lockout em passwords erradas.
- [ ] 6.4 Respostas de verify devolvem apenas campos mínimos (sem dados pessoais além do necessário para validar).

### Task 7: Higiene dos guards (F9, F10)

- [ ] 7.1 Remover `@UseGuards(JwtAuthGuard)` redundantes em `auth.controller.ts` e apagar `src/auth/jwt-auth.guard.ts` (confirmar que `RefreshTokenGuard` não depende dele).
- [ ] 7.2 `MetricsTokenGuard`: usar `crypto.timingSafeEqual` com comparação de comprimento fixo.
- [ ] 7.3 Swagger: em produção, exigir `SWAGGER_TOKEN` ou não montar `/docs`.

### Task 8: Ownership/IDOR com gate automático (F11)

**Files:** Create `test/integration/ownership-matrix.integration-spec.ts`

- [ ] 8.1 Lista declarativa `{ method, path, ownerResource }` para endpoints `:id` de recursos pessoais (PDI, avaliações, recibos, férias, documentos, matrículas, certificados).
- [ ] 8.2 Teste: utilizador B acede/edita/apaga recurso de A → 403/404 (nunca 200); RH/ADMIN → conforme política.
- [ ] 8.3 Script de lint (`scripts/check-ownership.ts`): para handlers com `@Param('id'|'userId')` e método de escrita, exige chamada a `assertCanAccess`/filtro por `userId` no serviço; exceções numa allow-list revista.
- [ ] 8.4 Corrigir lacunas encontradas, um commit por módulo.

### Task 9: Menor privilégio — papéis e permissões

- [ ] 9.1 Matriz papel × recurso × ação em `docs/security/rbac-matrix.md`, derivada do inventário da T3.
- [ ] 9.2 Reduzir `RH` de "super-utilizador" a permissões específicas; `register` e atribuição de roles só com `users.create`/`roles.assign`; RH não pode atribuir `ADMIN`.
- [ ] 9.3 Impedir auto-escalada: ninguém altera o próprio role/permissões; alterações de role geram `AuditLog` e incrementam `tokenVersion` (T2).
- [ ] 9.4 Contas de serviço/métricas: tokens separados por finalidade, rotação documentada.
- [ ] 9.5 Revisão trimestral: o teste `authz-coverage` corre em CI e bloqueia endpoints novos sem política.

## Review Focus

1. Token roubado após logout → deve falhar com 401 (T2.1).
2. Utilizador desativado/rebaixado com sessão aberta em 2 instâncias → efeito imediato (T2.2).
3. Handler novo sem `@Roles` → build falha (T3.3).
4. Cookie de refresh enviado a `/auth/logout` pelo browser real (T1.1).
5. Brute-force do password de share link e enumeração de códigos verify (T6).

## Self-Review

- Cobertura dos 5 pontos pedidos: (1) autenticação/expiração → T5, T7; (2) papéis → T3, T9; (3) ownership → T8; (4) logout/inatividade → T1, T2, T5; (5) isolamento admin → T4.
- Pontos **não verificados** nesta análise (assumidos a confirmar na execução): F3 (comportamento do browser), cobertura exata de `@Roles` por handler (grep por ficheiro, não por handler), exaustividade de ownership.
