# Instrutor Externo — Fase 2: Código por E-mail e Dispositivo Confiável

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, the user chose native execution) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Todo o login de um `INSTRUCTOR_EXTERNO` exige um código de 6 dígitos enviado por e-mail; um dispositivo ainda não registado exige-o também e fica registado (1 dispositivo ativo), com aviso por e-mail e auditoria.

**Architecture:** Novo `ExternalLoginSecurityService` em `src/instructor-invites/` (desafios + dispositivos) chamado pelo `AuthService.login` logo depois da verificação da palavra-passe, só para o papel `INSTRUCTOR_EXTERNO`. O cliente envia `deviceId` (UUID guardado em localStorage) e `emailCode` no corpo do login. Resposta sem código: `401 { code: 'EMAIL_CODE_REQUIRED', purpose }`.

**Tech Stack:** NestJS, Prisma/PostgreSQL, MailService, Jest + supertest, Next.js (repo `frontend/`).

**Spec:** `docs/superpowers/specs/2026-11-02-instrutor-externo-acesso-design.md` (secções 4.1 `LoginChallenge`/`TrustedDevice`, 4.3). Fase 1: `docs/superpowers/plans/2026-11-02-instrutor-externo-fase1-convite-validade.md`.

## Global Constraints

- Código: 6 dígitos (`crypto.randomInt`), guardar só `sha256(`${userId}:${code}`)`; validade **10 min**; máx. **5 tentativas** (à 5.ª falhada o desafio fica consumido); reenvio com intervalo mínimo de **60 s** (pedido dentro da janela não cria novo código nem envia e-mail, responde igual).
- `purpose`: `'LOGIN'` (dispositivo conhecido) | `'NEW_DEVICE'` (desconhecido ou sem `deviceId`).
- **1 dispositivo confiável ativo** por utilizador: registar um novo revoga o anterior (`revokedAt`), envia e-mail de alerta ao instrutor e audita `INSTRUCTOR_DEVICE_REGISTERED`.
- `deviceId` = UUID v4 gerado pelo frontend; guardar só `sha256(deviceId)` (`deviceIdHash`), mais `userAgent` e `ip`.
- Só afeta o papel `INSTRUCTOR_EXTERNO` (`role.name`); nenhum outro utilizador muda de comportamento.
- Erros: código errado/expirado/inexistente → mesma mensagem genérica `Código inválido ou expirado` (401); falhas contam para o bloqueio existente (`security.registerFailedAttempt`).
- Auditoria via `src/common/services/audit.service.ts`; `NotificationLog.metadata` com `JSON.stringify`.
- Migrations: `prisma migrate dev` falha sem TTY → migration manual em `prisma/migrations/20261218000000_instructor_login_security/migration.sql` + `npx prisma migrate deploy` + `npx prisma generate` (o `generate` pode não terminar com o backend a correr; o cliente é escrito na mesma). Ficheiros com fins de linha mistos: editar preservando o formato de cada um (`git ls-files --eol`).
- Git: commits locais Conventional Commits com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `npx prettier --write` no backend; no frontend não correr prettier em ficheiros existentes.
- Testes de integração: `afterAll` apaga filhos antes de pais (`LoginChallenge`/`TrustedDevice` antes de `User`); lotes pequenos (memória limitada): `--testPathPatterns=<pasta> --runInBand`.

## Review Focus

1. Código reutilizado depois de usado, ou de um desafio mais antigo substituído por um novo.
2. 5 tentativas erradas queimam o desafio: o código certo a seguir também falha.
3. Pedido repetido em <60 s não gera segundo e-mail (anti-spam do endereço do instrutor).
4. Dispositivo A registado; login em B com código certo regista B e A deixa de ser confiável (alerta enviado).
5. Utilizadores que não são instrutores externos não recebem desafio nenhum (login igual ao de hoje).

## Fora de âmbito (adiado, a dizer ao utilizador)

- Ligar o refresh token ao dispositivo (spec 4.3, última linha) — exige o cabeçalho de dispositivo em todos os pedidos; fica para uma fase seguinte.
- Cookie `httpOnly` com o `deviceId` (spec): nesta fase o `deviceId` vai no corpo e fica em localStorage.

---

### Task 1: Schema e migration

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20261218000000_instructor_login_security/migration.sql`.

**Interfaces — Produces:**
`model LoginChallenge { id String @id @default(uuid()); userId Int; codeHash String; purpose String; expiresAt DateTime; attempts Int @default(0); consumedAt DateTime?; createdAt DateTime @default(now()) }` (relação a `User`, `onDelete: Cascade`, `@@index([userId, createdAt])`);
`model TrustedDevice { id String @id @default(uuid()); userId Int; deviceIdHash String; userAgent String?; ip String?; firstSeenAt DateTime @default(now()); lastSeenAt DateTime @default(now()); revokedAt DateTime? }` (relação a `User`, `onDelete: Cascade`, `@@index([userId])`, `@@unique([userId, deviceIdHash])`); `User` ganha `loginChallenges LoginChallenge[]` e `trustedDevices TrustedDevice[]`.

- [ ] **Step 1:** Adicionar modelos e relações; `npx prisma validate` → "valid".
- [ ] **Step 2:** Escrever o SQL da migration à mão (tabelas, índices, FKs) coerente com o schema; `npx prisma migrate deploy` → "successfully applied"; `npx prisma generate`.
- [ ] **Step 3: Commit** `feat(instructor-externo): schema de desafios de login e dispositivos`.

---

### Task 2: `ExternalLoginSecurityService` e e-mails

**Files:** Create `src/instructor-invites/external-login-security.service.ts` e `.spec.ts`; Modify `src/mail/mail.service.ts`, `src/instructor-invites/instructor-invites.module.ts` (provider + export).

**Interfaces — Produces:**
- `MailService.sendLoginCode(email: string, fullName: string, code: string, purpose: 'LOGIN' | 'NEW_DEVICE'): Promise<void>`; `MailService.sendNewDeviceAlert(email: string, fullName: string, userAgent?: string): Promise<void>`.
- `ExternalLoginSecurityService`:
  - `isExternal(user: { role?: { name?: string | null } | null }): boolean`
  - `challenge(user: { id: number; email: string; fullName: string }, deviceId: string | undefined, ctx: { ip?: string; userAgent?: string }): Promise<{ purpose: 'LOGIN' | 'NEW_DEVICE' }>` — decide `purpose` pelo dispositivo; reutiliza o desafio vivo criado há <60 s (sem novo e-mail); caso contrário invalida os anteriores, cria e envia.
  - `verify(user: { id: number; email: string; fullName: string }, code: string, deviceId: string | undefined, ctx: { ip?: string; userAgent?: string }): Promise<boolean>` — `true` e consome se o código bate; senão incrementa `attempts` (queima ao chegar a 5) e devolve `false`; em `true` com `purpose === 'NEW_DEVICE'` ou dispositivo desconhecido chama `registerDevice`.
  - `registerDevice(userId: number, deviceId: string | undefined, ctx): Promise<void>` — revoga os ativos de outro hash, `upsert` do atual com `revokedAt: null`, `lastSeenAt: now`; se revogou algum, envia alerta e audita.
  - `resetDevices(userId: number, actorId: number): Promise<number>` — revoga todos; audita `INSTRUCTOR_DEVICES_RESET`.

- [ ] **Step 1: Testes (falham)** com Prisma/Mail/Audit mockados: (a) `challenge` sem dispositivo → `purpose NEW_DEVICE`, e-mail enviado com código de 6 dígitos e só `codeHash` guardado; com dispositivo ativo → `LOGIN`; (b) segundo `challenge` <60 s → não cria nem envia; (c) `verify` certo → `true`, desafio consumido; errado → `false`, `attempts+1`; 5.ª errada → consumido e o código certo a seguir → `false`; expirado → `false`; consumido → `false`; (d) `registerDevice` com outro ativo → revoga-o, envia alerta e audita; (e) `isExternal` só para `INSTRUCTOR_EXTERNO`.
- [ ] **Step 2:** Correr `npx jest src/instructor-invites/external-login-security.service.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar o serviço e os dois e-mails; registar no módulo.
- [ ] **Step 4:** Testes → PASS. **Commit** `feat(instructor-externo): código por e-mail e dispositivo confiável`.

---

### Task 3: Integrar no login

**Files:** Modify `src/auth/auth.dto.ts` (`LoginDto`), `src/auth/auth.service.ts` (`login`, ~l.235), `src/auth/auth.module.ts` (importar `InstructorInvitesModule`); Test `src/auth/auth.service.spec.ts`, `test/integration/instructor-invites/instructor-invites.integration-spec.ts`.

**Interfaces — Consumes:** `ExternalLoginSecurityService` (Task 2). **Produces:** `LoginDto.emailCode?: string` (`@Matches(/^\d{6}$/)`), `LoginDto.deviceId?: string` (`@IsUUID(4)`); resposta `401 { message, code: 'EMAIL_CODE_REQUIRED', purpose }`.

- [ ] **Step 1: Testes (falham)** unit em `auth.service.spec.ts`: instrutor externo sem `emailCode` → `UnauthorizedException` com `code 'EMAIL_CODE_REQUIRED'` e `challenge` chamado; com `emailCode` errado → `Código inválido ou expirado` e `registerFailedAttempt` chamado; com código certo → devolve sessão; utilizador não externo → `challenge` nunca chamado.
- [ ] **Step 2:** Implementar logo depois de `clearFailedAttempts`... mantendo a ordem: palavra-passe → (externo: desafio/verificação) → TOTP → sessão. `AuthService` recebe o serviço como `@Optional()`.
- [ ] **Step 3: Integração (falha → passa)**: o e-mail capturado do mock fornece o código; fluxo completo `login sem código → 401 EMAIL_CODE_REQUIRED → login com código → 201`; código errado → 401 genérico; mesmo código depois de usado → 401; 5 erros queimam o desafio; dispositivo A depois B: B pede código `NEW_DEVICE`, depois de aceite o alerta foi enviado e A volta a pedir `NEW_DEVICE`; employee normal faz login sem código (201 direto).
- [ ] **Step 4:** Correr `src/auth` unit e `--testPathPatterns=test/integration/(auth|instructor-invites)/` → PASS. **Commit** `feat(instructor-externo): segundo fator por e-mail no login`.

---

### Task 4: Registo no convite e reposição pelo administrador

**Files:** Modify `src/instructor-invites/instructor-invites.dto.ts` (`AcceptInstructorInviteDto.deviceId?`), `instructor-invites.service.ts` (`acceptInvite`), `instructor-invites.controller.ts`; Test unit + integração.

**Interfaces — Produces:** `acceptInvite(token: string, password: string, deviceId?: string, ctx?: {ip?: string; userAgent?: string})` regista o dispositivo (sem alerta) quando `deviceId` vem; `POST /instructor-invites/users/:userId/devices/reset` (`@Roles(ADMIN, RH)`, 200, `{ revoked: number }`) chamando `resetDevices`, 404 se não for instrutor externo.

- [ ] **Step 1: Testes (falham):** aceitar com `deviceId` → primeiro login nesse dispositivo pede `LOGIN` (não `NEW_DEVICE`); `devices/reset` → o mesmo dispositivo volta a pedir `NEW_DEVICE`; reset a um utilizador não externo → 404; EMPLOYEE → 403.
- [ ] **Step 2:** Implementar; **Step 3:** testes → PASS. **Commit** `feat(instructor-externo): registar dispositivo no convite e repô-lo pelo administrador`.

---

### Task 5: Frontend (repo `frontend/`)

**Files:** Modify `hooks/useLogin.ts`, `components/login/LoginView.tsx`, `app/auth/instructor-invite/page.tsx`, `hooks/useInstructorInvites.ts`, `components/users/InstructorInvitesView.tsx`; Create `lib/deviceId.ts`.

- [ ] **Step 1:** `lib/deviceId.ts`: `getDeviceId(): string` (UUID v4 em `localStorage['innova.deviceId']`, com `try/catch`, devolve um UUID efémero se o storage falhar).
- [ ] **Step 2:** `useLogin`: enviar `deviceId` (e `emailCode` quando existir); se o erro tiver `code === 'EMAIL_CODE_REQUIRED'` entra no passo "código" (estado `needsCode`, `purpose`), sem mostrar erro; `LoginView` mostra, nesse passo, um campo de 6 dígitos com texto "Enviámos um código para o seu email" (e "Dispositivo novo" quando `purpose === 'NEW_DEVICE'`) e o botão "Entrar". Confirmar em `lib/apiClient.ts` como o corpo do erro (`code`) chega ao `ApiError`.
- [ ] **Step 3:** Página de convite envia `deviceId` ao aceitar. Gestão: ação "Repor dispositivo" nas linhas aceites (`ConfirmDialog` destrutivo) → `POST …/devices/reset`.
- [ ] **Step 4:** `npx tsc --noEmit` limpo. **Commit** no repo do frontend `feat(instructor-externo): código por email no login e reposição de dispositivo`.

---

### Task 6: Verificação

- [ ] `npx tsc --noEmit` (backend e frontend); `npx prettier --check` nos ficheiros do backend alterados.
- [ ] Unit: `src/auth src/instructor-invites src/mail src/users`; integração em lotes: `auth`, `users`, `instructor-invites` (um processo cada).

## Auto-revisão

Spec 4.3: código em todo o login (T3), dispositivo novo (T2/T3), 1 dispositivo + alerta + auditoria (T2), reposição pelo admin (T4), regras do código (T2). Adiados: refresh ligado ao dispositivo e cookie httpOnly. Nomes consistentes: `challenge`, `verify`, `registerDevice`, `resetDevices`, `EMAIL_CODE_REQUIRED`, `purpose`.
