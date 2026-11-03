# Instrutor Externo — Fase 1: Convite, Validade e Expiração Automática

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN/RH convidam um instrutor externo por e-mail com link de uso único; a conta vale `accessDays` (30) e é bloqueada e desativada automaticamente ao expirar.

**Architecture:** Novo módulo `src/instructor-invites/` (modelo `InstructorInvite` + serviço + controller ADMIN/RH + cron de expiração). Endpoint público `POST /auth/instructor-invite/accept` define a palavra-passe numa transação. A validade (`User.accessExpiresAt`) é aplicada em tempo de pedido (login, refresh, `JwtStrategy.validate`) e pelo cron horário. Frontend (repo separado `frontend/`): página de aceitação e gestão de convites.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `@nestjs/schedule` + `ClusterCronLockService`, Bull fila `email`, Jest + supertest (integração real), Next.js app router.

**Spec:** `docs/superpowers/specs/2026-11-02-instrutor-externo-acesso-design.md` (secções 4.1, 4.2, 4.4, 4.6; as fases 2 e 3 ficam fora).

## Global Constraints

- Token do convite: 32 bytes aleatórios hex, guardar só SHA-256 (`tokenHash @unique`); validade do link **72 h**; uso único.
- Conta: role `INSTRUCTOR_EXTERNO` (procurar `Role` por `name`), `accountStatus = PENDING` até aceitar; `accessExpiresAt = now + accessDays` (por defeito **30** dias; `accessDays` inteiro 1–365).
- Expirada = `accessExpiresAt < now`: login, refresh e pedidos autenticados dão 401; o cron põe `accountStatus = INACTIVE`, `active = false`, revoga refresh tokens e sessões; **dados criados mantêm-se**.
- Erros de token genéricos: "Convite inválido ou expirado" (nunca distinguir usado/expirado/inexistente).
- Endpoints de gestão: `@Roles(Role.ADMIN, Role.RH)`. Endpoint de aceitação: `@Public()` + `@Throttle(AUTH_THROTTLE)`. O `RolesGuard` compara `user.role.name`.
- Campos reais: `User.fullName`; `AuditLog.entity`; auditoria via `src/common/services/audit.service.ts` (`AuditService.log`); `NotificationLog.metadata` com `JSON.stringify`.
- Migrations: `prisma migrate dev` falha sem TTY → `prisma migrate diff` + migration manual em `prisma/migrations/20261217000000_instructor_external_invites/migration.sql`; confirmar com `npx prisma migrate status` e `npx prisma generate` (reiniciar o backend na porta 4000).
- Git: commits locais Conventional Commits, terminar com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `npx prettier --write` nos ficheiros alterados do backend; nunca push para `main`.
- Testes de integração: `afterAll` apaga filhos antes de pais (`InstructorInvite` antes de `User`), por `userId`/`id` explícitos; correr a suite de integração completa no fim.
- Observação da recon: `UsersService.invite` já funciona (o token é criado no `EmailProcessor`); o novo fluxo é independente e não o altera.

## Review Focus

1. Convite aceite duas vezes em paralelo (duplo clique): só uma transação vence; a outra recebe o erro genérico (teste de concorrência).
2. E-mail já existente (utilizador interno ou outro externo): `409` sem criar nada nem revelar dados do utilizador existente.
3. Prazo mudado depois: prolongar uma conta já expirada e desativada a reativa (`active`, `ACTIVE`) mas só se já tinha aceite o convite; antes de aceitar continua `PENDING`.
4. Revogar convite enquanto o instrutor tem o link aberto: aceitação falha com o erro genérico; conta `PENDING` não consegue fazer login.
5. Tarefa cron a correr em duas instâncias ou duas vezes seguidas: idempotente, uma só entrada de auditoria por conta.

---

## File Structure

- Create `src/instructor-invites/instructor-invites.module.ts` — módulo, importa Prisma, Mail, Users, Audit, SessionRevocation.
- Create `src/instructor-invites/instructor-invites.service.ts` — criar/listar/revogar/reenviar/prolongar/desativar convites e contas externas; `acceptInvite`.
- Create `src/instructor-invites/instructor-invites.controller.ts` — rotas ADMIN/RH `/instructor-invites`.
- Create `src/instructor-invites/instructor-invites.dto.ts` — DTOs com `class-validator`.
- Create `src/instructor-invites/instructor-access-expiry.service.ts` — cron + `runExpiryJob()`.
- Modify `prisma/schema.prisma`, new migration; `src/mail/mail.service.ts`; `src/auth/auth.controller.ts`, `auth.service.ts`, `jwt.strategy.ts`; `src/app.module.ts`.
- Tests: `src/instructor-invites/*.spec.ts` (unit, rápidos) e `test/integration/instructor-invites/instructor-invites.integration-spec.ts`.
- Frontend: `frontend/app/auth/instructor-invite/page.tsx`, `frontend/app/(platform)/instructor-invites/page.tsx` + hooks/serviços no padrão do repo.

---

### Task 1: Schema e migration

**Files:**
- Modify: `prisma/schema.prisma` (modelo `User` ~l.700–1110; novo modelo)
- Create: `prisma/migrations/20261217000000_instructor_external_invites/migration.sql`

**Interfaces:**
- Produces: `User.accessExpiresAt DateTime?` (+ `@@index([accessExpiresAt])`); `model InstructorInvite { id String @id @default(uuid()); userId Int; email String; tokenHash String @unique; expiresAt DateTime; usedAt DateTime?; revokedAt DateTime?; createdById Int?; createdAt DateTime @default(now()) }` com relação a `User` (`onDelete: Cascade`) e `@@index([userId])`, `@@index([email])`. Tipo de `User.id` é `Int`.

- [ ] **Step 1:** Confirmar em `schema.prisma` o tipo de `User.id` e o nome do modelo de utilizador; adicionar o campo e o modelo.
- [ ] **Step 2:** Gerar o SQL com `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` (ou from-migrations/shadow DB se o drift da BD dev o exigir) e guardá-lo na pasta da migration; remover ruído não relacionado.
- [ ] **Step 3:** Aplicar com `npx prisma migrate deploy`; correr `npx prisma migrate status` → "Database schema is up to date"; `npx prisma generate`.
- [ ] **Step 4: Commit** `feat(instructor-externo): schema de convites e validade de acesso`.

---

### Task 2: Serviço de convites (criar, listar, revogar, reenviar, prolongar)

**Files:**
- Create: `src/instructor-invites/instructor-invites.service.ts`, `.dto.ts`, `.module.ts`, `.controller.ts`
- Modify: `src/mail/mail.service.ts` (novo `sendInstructorInvite`), `src/app.module.ts` (registar módulo)
- Test: `src/instructor-invites/instructor-invites.service.spec.ts`; `test/integration/instructor-invites/instructor-invites.integration-spec.ts`

**Interfaces:**
- Produces (service):
  - `create(dto: CreateInstructorInviteDto, actorId: number): Promise<{ inviteId: string; userId: number; expiresAt: Date; accessExpiresAt: Date }>`
  - `list(): Promise<InviteListItem[]>` (`id, email, fullName, status: 'PENDING'|'ACCEPTED'|'REVOKED'|'EXPIRED', expiresAt, accessExpiresAt, createdAt`)
  - `revoke(inviteId: string, actorId: number): Promise<void>`
  - `resend(inviteId: string, actorId: number): Promise<{ inviteId: string }>` (revoga o anterior, cria novo)
  - `extendAccess(userId: number, accessDays: number, actorId: number): Promise<{ accessExpiresAt: Date }>`
  - `deactivate(userId: number, actorId: number): Promise<void>`
- Produces (mail): `MailService.sendInstructorInvite(email: string, fullName: string, token: string, accessDays: number): Promise<void>` com link `${APP_URL}/auth/instructor-invite?token=<token>`.
- `CreateInstructorInviteDto { @IsEmail email; @IsString @MinLength(2) fullName; @IsOptional @IsInt @Min(1) @Max(365) accessDays?: number }`.
- Controller: `POST /instructor-invites`, `GET /instructor-invites`, `POST /instructor-invites/:id/revoke`, `POST /instructor-invites/:id/resend`, `PATCH /instructor-invites/users/:userId/extend` `{accessDays}`, `POST /instructor-invites/users/:userId/deactivate`; todas `@Roles(Role.ADMIN, Role.RH)`. O `:id` é UUID (`ParseUUIDPipe`).

- [ ] **Step 1: Teste unitário (falha)** com Prisma mockado: `create` com e-mail já existente lança `ConflictException` sem criar nada; sem `accessDays` usa 30; só o `tokenHash` é persistido (nunca o token); o e-mail enviado contém o token em claro.
- [ ] **Step 2:** Correr `npx jest src/instructor-invites/instructor-invites.service.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar `create` numa `$transaction`: criar `User` (role `INSTRUCTOR_EXTERNO` por `name`, `PENDING`, `active: true`, `accessExpiresAt`, sem palavra-passe utilizável — seguir como `UsersService.create` trata utilizadores convidados) e `InstructorInvite`; enviar o e-mail **depois** do commit, pelo `MailService` diretamente (o token não vai para a fila Bull); auditar `INSTRUCTOR_INVITE_CREATED`.
- [ ] **Step 4:** Implementar `revoke`, `resend`, `extendAccess` (se a conta já tinha aceite e estava desativada por expiração, reativa `active=true`, `accountStatus=ACTIVE`), `deactivate` (mesmo efeito do cron para um utilizador) e `list`; todos auditados.
- [ ] **Step 5:** Controller + DTO + módulo + registo em `app.module.ts`; formatar com prettier.
- [ ] **Step 6: Teste de integração (falha → passa)** em `test/integration/instructor-invites/…`: ADMIN cria → 201; EMPLOYEE → 403; e-mail duplicado → 409; revogar muda o estado; `afterAll` apaga convites antes de utilizadores.
- [ ] **Step 7:** Correr unit + integração → PASS. **Commit** `feat(instructor-externo): convites temporários de instrutor externo`.

---

### Task 3: Aceitação do convite (público)

**Files:**
- Modify: `src/instructor-invites/instructor-invites.service.ts` (`acceptInvite`), `src/auth/auth.controller.ts` (nova rota)
- Test: unit + o ficheiro de integração da Task 2

**Interfaces:**
- Consumes: `InstructorInvite`, `hashPassword` e validação de palavra-passe usadas em `PasswordResetService.resetPassword` (`this.security?.assertPasswordAllowed`).
- Produces: `acceptInvite(token: string, password: string): Promise<{ message: string }>`; rota `POST /auth/instructor-invite/accept` `@Public() @Throttle(AUTH_THROTTLE)` com body `{ token: string; password: string }` (DTO validado; `password` 6–128 como `LoginDto`). Não inicia sessão: o instrutor faz login em seguida.

- [ ] **Step 1: Testes (falham)**: token válido → palavra-passe definida, `usedAt` preenchido, `accountStatus=ACTIVE`, `passwordChangedAt` preenchido; mesmo token segunda vez → 400 "Convite inválido ou expirado"; token expirado, revogado, inexistente → exatamente a mesma mensagem; duas chamadas simultâneas com o mesmo token → uma 201, outra 400 (usar `updateMany({ where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } } })` e verificar `count === 1` dentro da transação); conta com `accessExpiresAt` já passado → erro genérico.
- [ ] **Step 2:** Correr → FAIL. **Step 3:** Implementar em `$transaction`: reclamar o convite (`updateMany` condicional), atualizar `User` (hash da palavra-passe, `passwordChangedAt`, `accountStatus: ACTIVE`), revogar refresh tokens do utilizador; auditar `INSTRUCTOR_INVITE_ACCEPTED`.
- [ ] **Step 4:** Rota no `auth.controller.ts` delegando em `InstructorInvitesService` (importar o módulo em `AuthModule` sem criar ciclo; se houver ciclo usar `forwardRef`).
- [ ] **Step 5:** Integração: fluxo completo convite → aceitar → `POST /auth/login` devolve 201; antes de aceitar, login falha. PASS. **Commit** `feat(instructor-externo): aceitação de convite com link de uso único`.

---

### Task 4: Aplicar a validade em login, refresh e pedidos

**Files:**
- Modify: `src/auth/auth.service.ts` (`login` ~l.156, `rotateRefreshToken` ~l.489), `src/auth/jwt.strategy.ts` (`validate`/`loadUser`)
- Test: `src/auth/auth.service.spec.ts`, `src/auth/jwt.strategy.spec.ts`, integração

**Interfaces:**
- Produces: helper puro `isAccessExpired(user: { accessExpiresAt?: Date | null }, now = new Date()): boolean` em `src/auth/access-expiry.ts`; as três entradas lançam `UnauthorizedException('Acesso expirado — contacte o administrador')` quando `true`. Utilizadores com `accessExpiresAt = null` nunca expiram por esta via.

- [ ] **Step 1: Testes (falham)**: unit do helper (null → false; passado → true; futuro → false); `login` de conta expirada → 401 mesmo com palavra-passe certa; `validate` de utilizador expirado com JWT ainda válido → 401; refresh com conta expirada → 401 e sessões revogadas.
- [ ] **Step 2:** Implementar o helper e os três pontos de verificação. Atenção: `JwtStrategy` tem cache de 30 s por utilizador (`JWT_USER_CACHE_TTL_MS`) — verificar `accessExpiresAt` sobre o objeto em cache **a cada** pedido (não só ao carregar).
- [ ] **Step 3:** Garantir que `loadUser` devolve `accessExpiresAt` (confirmar o `select`/`include`).
- [ ] **Step 4:** Integração: definir `accessExpiresAt` no passado via Prisma → pedido autenticado com token antigo dá 401 imediatamente. PASS. **Commit** `feat(instructor-externo): bloquear acesso expirado em login, refresh e pedidos`.

---

### Task 5: Tarefa agendada de expiração

**Files:**
- Create: `src/instructor-invites/instructor-access-expiry.service.ts`
- Modify: `src/instructor-invites/instructor-invites.module.ts` (provider)
- Test: unit + integração

**Interfaces:**
- Produces: `InstructorAccessExpiryService` com `@Cron('0 * * * *') scheduled(): Promise<void>` (padrão `src/certificates/certificate-expiry.service.ts`, lock de cluster já aplicado globalmente) e `runExpiryJob(now = new Date()): Promise<{ deactivated: number }>`.

- [ ] **Step 1: Teste (falha)**: com 2 contas expiradas ativas, 1 válida e 1 sem `accessExpiresAt`, `runExpiryJob` desativa só as 2 expiradas (`active=false`, `accountStatus=INACTIVE`), revoga os seus `RefreshToken` e chama `revokeAllUserSessions`; segunda execução devolve `deactivated: 0` e não duplica auditoria.
- [ ] **Step 2:** Implementar com lotes (`BATCH=200`) e reclamação atómica por conta (`updateMany` com `active: true` na condição; auditar só quando `count === 1`). Erros por conta não interrompem o lote.
- [ ] **Step 3:** Integração do `runExpiryJob` contra Postgres real. PASS. **Commit** `feat(instructor-externo): desativação automática de contas expiradas`.

---

### Task 6: Frontend (repo `frontend/`, commits próprios)

**Files:**
- Create: `frontend/app/auth/instructor-invite/page.tsx`, `frontend/app/(platform)/instructor-invites/page.tsx` e respetivos hooks/serviços seguindo o padrão do repo (TanStack Query + `useToast`)
- Modify: sidebar (entrada visível só a ADMIN/RH, alinhada com os `@Roles` do backend)

**Interfaces:**
- Consumes: endpoints das Tasks 2–3.

- [ ] **Step 1:** Página pública `auth/instructor-invite?token=`: formulário palavra-passe + confirmação; sucesso → redireciona para `/login` com toast; erro mostra a mensagem genérica com `AlertCard` (regra 16). Sem token na URL → `AlertCard` "Link de convite incompleto".
- [ ] **Step 2:** Página de gestão: tabela de convites (estado, validade do link, validade do acesso), formulário "Novo convite" (e-mail, nome, dias de acesso, por defeito 30) e ações reenviar/revogar/prolongar/desativar; filtro por estado com `PeriodPills` ou `ShortcutPills` conforme o caso (regra 17); texto em português, sem enums crus.
- [ ] **Step 3:** `npx tsc --noEmit` limpo no frontend; testar manualmente no browser: criar convite (copiar o link do e-mail/log do mailer de dev), aceitar, fazer login, ver o estado mudar.
- [ ] **Step 4: Commit** no repo do frontend `feat(instructor-externo): convites e página de aceitação`.

---

### Task 7: Verificação final

- [ ] **Step 1:** `npx tsc --noEmit` e `npx prettier --check` nos ficheiros alterados (backend).
- [ ] **Step 2:** Suite unitária das áreas tocadas + **suite de integração completa** (`DB_POOL_MAX=5` em `.env.test`) → tudo verde; dizer explicitamente o que não correu.
- [ ] **Step 3:** Smoke manual: convite → e-mail → aceitar → login; forçar `accessExpiresAt` no passado → 401; correr o job → conta `INACTIVE`.

## Auto-revisão

- Cobertura do spec fase 1: 4.1 (campo + `InstructorInvite`; `LoginChallenge`/`TrustedDevice` ficam para a fase 2) → T1; 4.2 → T2/T3; 4.4 → T4/T5; 4.6 (páginas de aceitação e convites) → T6. Prolongar/desativar → T2.
- Tipos consistentes: `accessExpiresAt`, `InstructorInvite`, `acceptInvite`, `runExpiryJob`, `isAccessExpired` usados com os mesmos nomes entre tarefas.
- Fora de âmbito (fase 2/3): 2FA por e-mail, dispositivos, permissões por módulo.
