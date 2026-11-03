# Instrutor Externo — Endurecimento (riscos adiados das fases 1 e 2)

> **For agentic workers:** executar inline com `superpowers:executing-plans`, TDD (teste a falhar primeiro). Contexto: fases 1 e 2 em `docs/superpowers/plans/2026-11-02-instrutor-externo-fase{1,2}-*.md`; spec `docs/superpowers/specs/2026-11-02-instrutor-externo-acesso-design.md` §4.3.

**Goal:** fechar os riscos que as fases 1–2 deixaram em aberto, antes da fase 3 (permissões por módulo).

**Architecture:** o identificador do dispositivo passa de `localStorage`/corpo do pedido para um cookie `httpOnly` definido pelo backend (`innova_device`, path `/api/auth`); o refresh token do instrutor externo fica ligado a esse dispositivo (`RefreshToken.deviceIdHash`); os serviços de desafio/dispositivo passam a usar um *advisory lock* por utilizador e contagem atómica de tentativas.

## Global Constraints

- Cookie `innova_device`: `httpOnly`, `sameSite: 'lax'`, `secure` em produção, `path: '/api/auth'` (o mesmo prefixo do cookie de refresh, que o browser vê atrás do rewrite/Caddy), `maxAge` 1 ano; valor = UUID v4 gerado pelo servidor; só o hash SHA-256 é guardado.
- `deviceId` deixa de existir em `LoginDto` e `AcceptInstructorInviteDto` (o `ValidationPipe` usa `forbidNonWhitelisted`); o controlador lê o cookie (ou gera um novo) e passa-o em `AuthRequestContext.deviceId`.
- Refresh: token de instrutor externo guarda `deviceIdHash`; na rotação, cookie ausente ou diferente → cadeia revogada + 401 `Refresh token inválido`. Utilizadores não externos: sem alteração.
- Tentativas do código: contagem atómica (`increment`) **antes** de comparar; > 5 → recusa sem comparar. Bloqueio da conta por código errado devolve a mesma mensagem de conta bloqueada do login por palavra-passe.
- Mesmos limites da fase 2: código 6 dígitos, 10 min, 5 tentativas, reenvio ≥ 60 s, 1 dispositivo ativo.
- `userAgent` guardado/auditado/enviado por e-mail: sem caracteres de controlo, máx. 300 (e-mail: máx. 120, sem URLs).
- Migrations manuais (`prisma migrate deploy` + `prisma generate`; `tsc` precisa de `NODE_OPTIONS=--max-old-space-size=8192`); EOL: editar preservando o formato de cada ficheiro; commits locais com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; frontend sem prettier em ficheiros existentes.

## Review Focus

1. Cookie roubado/copiado para outro browser: refresh recusado; dispositivo diferente exige código novo.
2. Dois pedidos de login simultâneos do mesmo instrutor: um só desafio vivo; só o último código serve.
3. Palpites em paralelo contra o mesmo desafio nunca ultrapassam 5.
4. Pedido do dispositivo B dentro de 60 s do pedido do A envia o e-mail "dispositivo novo".
5. Utilizadores não externos: login/refresh iguais aos de hoje (sem cookie obrigatório).

## Tasks

### Task 1 — Schema: `RefreshToken.deviceIdHash String?` (+ `@@index([deviceIdHash])` não necessário). Migration `20261219000000_refresh_token_device`.

### Task 2 — Cookie do dispositivo (backend)
- `token-cookie.ts`: `DEVICE_COOKIE = 'innova_device'`, `buildDeviceCookieOptions(isProd)`.
- `AuthController`: helper privado `deviceFor(req, res): string` — lê `req.cookies[DEVICE_COOKIE]` se for UUID v4, senão gera, e faz `res.cookie(...)` (antes de chamar o serviço, para o cookie seguir também nas respostas 401 de `EMAIL_CODE_REQUIRED`); `login` e `refresh` passam `{...requestContext(req), deviceId}`. `InstructorInviteAcceptController` faz o mesmo.
- `AuthRequestContext.deviceId?: string`; `AuthService.login` usa `ctx.deviceId`; remover `deviceId` dos DTOs.
- Testes: unit do controlador (cookie definido; reutiliza o existente; ignora valor inválido); specs do serviço passam o `deviceId` por `ctx`; integração passa o cookie por `Cookie` header.

### Task 3 — Refresh ligado ao dispositivo
- `persistRefreshToken(..., ctx, refreshDays, bindDevice)` grava `deviceIdHash = sha256(ctx.deviceId)` se `bindDevice`; `issueSessionForUser` recebe `opts.bindDevice` (o `login` passa `true` para externos); `rotateRefreshToken(userId, email, presented, ctx?)` compara `record.deviceIdHash` com o cookie e propaga o hash ao novo token.
- Testes: rotação com cookie igual → ok e novo token com o mesmo hash; cookie diferente/ausente → 401 e cadeia revogada; token sem hash (utilizador normal) → ok sem cookie. Integração: refresh do instrutor com o cookie dele funciona, com outro cookie → 401.

### Task 4 — Endurecimento de `ExternalLoginSecurityService`
- `challenge`: transação interativa com `pg_advisory_xact_lock(userId)` à volta de "desafio recente? → invalidar → criar"; reaproveitar o recente só se `purpose` igual.
- `verify`: `update({ attempts: { increment: 1 } })` primeiro; `attempts > 5` → `false`; ao atingir 5 consome o desafio; comparação só depois. Ao validar com sucesso consome também outros desafios vivos do utilizador.
- `registerDevice`: dentro da mesma transação com *lock*; `userAgent` sanitizado; sem exceções para o chamador quando usado a partir do convite (`acceptInvite` apanha e regista aviso).
- `AuthService.login`: se `registerFailedAttempt` devolver bloqueio → mensagem de conta bloqueada.
- Testes unit correspondentes + integração (pedidos simultâneos, palpites paralelos).

### Task 5 — Frontend
- Remover `lib/deviceId.ts` (+ teste) e o `deviceId` dos corpos; `useLogin`: ação `resendCode` ("Enviar novo código") que repete o login sem código; `LoginView`: botão no passo do código. Teste de componente do passo do código.

### Task 6 — Verificação: `tsc` (BE/FE), unitários `src/auth src/instructor-invites src/mail src/common`, integração por lotes `instructor-invites`, `auth`, `users`; revisão independente.
