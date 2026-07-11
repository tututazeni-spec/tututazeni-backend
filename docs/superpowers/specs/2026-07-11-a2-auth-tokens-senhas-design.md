# Design — Remediação A-2: Autenticação, Tokens e Senhas

> Remedia os achados do relatório `docs/security/2026-07-11-auditoria-a2-auth-tokens-senhas.md`
> (A2-1 a A2-9). Aprovado em brainstorm a 2026-07-11.

## Decisões tomadas

| Decisão | Escolha | Racional |
|---|---|---|
| Entrega do reset (A2-1) | Backend completo com `MailService` por interface; entrega abstraída (regista/enfileira, como os stubs atuais) | Fecha A2-1 testável sem bloquear no SMTP; ligar SMTP real é config, não código |
| Refresh (A2-2) | Cookie httpOnly dedicado + verificação com `JWT_REFRESH_SECRET` + rotação com persistência do hash | Permite revogação individual e deteção de reutilização; consistente com o cookie da A-1 |
| Âmbito | Todos os achados A2-1..A2-9, entregues em 3 PRs faseadas por risco | Fecha a Faixa A-2 por completo de forma coerente |
| Share links (A2-3) | sha256 → bcrypt cost 12 | Elimina hash rápido sem salt |
| Invalidação de sessões | Campo `passwordChangedAt` no User; `JwtStrategy` compara com `payload.iat` | Mata access tokens antigos após reset sem blocklist de access |

**Regra de migração (runbook §6):** todas as alterações de schema são
expand-only (colunas nullable / tabelas novas) — compatíveis com rollback.

## 1. Schema (Prisma) — adições expand-only

```prisma
model PasswordResetToken {
  id        Int       @id @default(autoincrement())
  userId    Int
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique      // sha256 do token aleatório (256 bits — entropia alta, sha256 aceitável aqui)
  expiresAt DateTime
  usedAt    DateTime?              // uso único
  createdAt DateTime  @default(now())

  @@index([userId])
}

model RefreshToken {
  id           Int       @id @default(autoincrement())
  userId       Int
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String    @unique   // sha256 do refresh JWT emitido
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById Int?                // cadeia de rotação (aponta para o token que o substituiu)
  createdAt    DateTime  @default(now())

  @@index([userId])
}

// User ganha:
//   passwordChangedAt DateTime?
//   passwordResetTokens PasswordResetToken[]
//   refreshTokens       RefreshToken[]
```

`DocShareLink.passwordHash` mantém-se (só muda o algoritmo que o preenche).

Migração aplicada com `prisma migrate deploy` no arranque (padrão do projeto).
Nota: sha256 nos **tokens** é seguro — são valores aleatórios de 256 bits sem
espaço de dicionário; o problema do A2-3 era usar hash rápido em **senhas**
escolhidas por humanos (baixa entropia), que exigem bcrypt.

## 2. Recuperação de senha (A2-1)

**`MailService`** (`src/mail/mail.service.ts`) — interface com um método
`sendPasswordReset(email: string, token: string): Promise<void>`. Implementação
atual regista de forma estruturada / enfileira (mesmo padrão de
`scalability.events.ts`); um `SmtpMailService` real liga-se depois via os
`SMTP_*` já presentes no `.env.production` (introduzidos na A-1). Injetável, para
os testes usarem um fake.

**`forgotPassword(email)`**:
1. Procura o utilizador (primary). Independentemente de existir:
2. Se existe e está ativo: gera `token = randomBytes(32).toString('hex')`,
   guarda `PasswordResetToken` com `tokenHash = sha256(token)`, `expiresAt =
   now + 30min`; chama `MailService.sendPasswordReset`.
3. Resposta **genérica e de tempo constante** (`{ message: 'Se o email existir…' }`)
   — não revela existência de conta (mitiga enumeração). Fazer o trabalho de
   hashing/dummy mesmo quando o utilizador não existe, para não vazar por timing.

**`resetPassword(token, newPassword)`**:
1. `sha256(token)` → procura `PasswordResetToken` por `tokenHash`.
2. Rejeita se não existe, `usedAt != null`, ou `expiresAt < now`.
3. Valida `newPassword` contra a política (secção 4).
4. `bcrypt.hash(newPassword, 12)` → atualiza `user.password` +
   `passwordChangedAt = now`.
5. Marca `usedAt = now`. Revoga todos os `RefreshToken` ativos do utilizador.
6. Resposta de sucesso.

## 3. Refresh token com rotação (A2-2)

**Emissão** (login, register, refresh): além do cookie de sessão `token`
(access, 15m), define um 2º cookie httpOnly `refresh_token`:
- `path: '/auth/refresh'` (só viaja nesse endpoint), `httpOnly`, `secure` em
  prod, `sameSite: 'lax'`, `maxAge` = 7 dias.
- Persiste `RefreshToken { tokenHash: sha256(refreshJwt), expiresAt }`.

**`RefreshTokenStrategy`** (`src/auth/refresh-token.strategy.ts`, passport):
extrai do cookie `refresh_token`, verifica assinatura+expiração com
`JWT_REFRESH_SECRET`. Novo `RefreshTokenGuard`. O endpoint `POST /auth/refresh`
troca de `@UseGuards(JwtAuthGuard)` para `@UseGuards(RefreshTokenGuard)`.

**`refreshToken` (serviço)**:
1. Do cookie, calcula `sha256` e procura o `RefreshToken`.
2. Se não existe **ou** `revokedAt != null` → possível reutilização de token
   roubado: revoga toda a cadeia ativa do utilizador e lança `Unauthorized`.
3. Se `expiresAt < now` → `Unauthorized`.
4. **Rotação**: marca o atual `revokedAt = now`, emite novo par, cria novo
   `RefreshToken` e liga `replacedById`. Redefine ambos os cookies.

**`logout`**: revoga o `RefreshToken` atual (por hash do cookie) e limpa ambos
os cookies.

Constantes de cookie centralizadas em `src/auth/token-cookie.ts` (já criado na
A-1): acrescentar `REFRESH_COOKIE` e `buildRefreshCookieOptions(isProd)`.

## 4. Share links, rate-limit, política, revogação, higiene (A2-3..A2-9)

- **A2-3** — `src/document-repository/document-repository.service.ts`:
  `createShareLink` usa `bcrypt.hash(dto.password, 12)`; `resolveShareLink` usa
  `bcrypt.compare` (tempo constante). Extrair para helper
  `hashSharePassword`/`verifySharePassword` no mesmo módulo. Sem migração de
  dados: links antigos com hash sha256 deixam de validar — documentar no PR
  (share links são efémeros, expiram em ≤7 dias; aceitável).
- **A2-4** — `@Throttle({ default: { limit: 5, ttl: 60000 } })` em
  `POST /auth/login` e `POST /auth/forgot-password`, sobrepondo-se ao global
  (100/min). O `ThrottlerGuard` já é `APP_GUARD` global — o decorator por rota
  chega.
- **A2-5** — Decorator `@IsStrongPassword` (wrapper de `@MinLength(10)` +
  `@Matches` de complexidade: maiúscula, minúscula, dígito) em
  `src/common/validators/strong-password.decorator.ts`, aplicado a
  `RegisterDto.password`, `ResetPasswordDto.newPassword`,
  `ChangePasswordDto.newPassword` e ao equivalente em `users.dto`. **Não** ao
  `LoginDto` (aí só se validam credenciais, não se impõe política).
- **A2-6/7** — `JwtStrategy.validate`: após carregar o user, se
  `user.passwordChangedAt` existe e `payload.iat * 1000 < passwordChangedAt` →
  `Unauthorized` (token pré-reset). Reduzir `cacheTtlMs` default para 30s e
  garantir que a entrada é apagada quando o user fica inativo. Fallback Bearer
  do extractor passa a depender de `AUTH_ALLOW_BEARER` (default `true` para não
  partir o Swagger; desligável em produção).
- **A2-8** — `prisma/seed.ts`: contas semente com `accountStatus: 'PENDING'`
  (força troca no 1º login por convenção existente do campo).
- **A2-9** — `auth.service.ts` login: o `.catch` do audit log passa a
  `logger.warn` estruturado (não engole silenciosamente).

## Componentes e ficheiros

| Ficheiro | Responsabilidade | PR |
|---|---|---|
| `prisma/schema.prisma` + migração | novos modelos + `passwordChangedAt` | A |
| `src/mail/mail.service.ts` (+ module) | interface de envio + impl. log/queue | A |
| `src/auth/password-reset.service.ts` | forgot/reset (lógica testável isolada) | A |
| `src/auth/auth.service.ts` | ligar reset; revogar refresh; warn audit | A/B/C |
| `src/auth/refresh-token.strategy.ts` + guard | verificação do refresh | B |
| `src/auth/token-cookie.ts` | `REFRESH_COOKIE` + opções | B |
| `src/common/validators/strong-password.decorator.ts` | política de senha | C |
| `src/document-repository/document-repository.service.ts` | bcrypt nos share links | C |
| DTOs de auth/users | aplicar validador; `@Throttle` no controller | C |

## Testes (TDD por PR)

- **PR-A**: reset — token válido/expirado/reutilizado/inexistente; resposta
  genérica em forgot; `passwordChangedAt` atualizado; refresh revogado no reset;
  `MailService` fake recebe o token. Specs Jest (`--forceExit`).
- **PR-B**: rotação — refresh válido roda e revoga o antigo; refresh revogado
  reutilizado revoga a cadeia; access token usado em `/auth/refresh` é recusado;
  `JwtStrategy` recusa token com `iat` anterior a `passwordChangedAt`.
- **PR-C**: bcrypt nos share links (hash≠sha256, compare correto); `@Throttle`
  devolve 429 acima do limite (teste de integração leve); validador de senha
  aceita/recusa conforme política; fallback Bearer desligável.

## Ordem de entrega

1. **PR-A** — migração + `MailService` + reset de senha (A2-1) + revogação de
   refresh no reset.
2. **PR-B** — refresh rotação + `RefreshTokenStrategy` + `passwordChangedAt` no
   `JwtStrategy` (A2-2, A2-6).
3. **PR-C** — share links bcrypt + rate-limit + política de senha + Bearer flag
   + higiene (A2-3, A2-4, A2-5, A2-7, A2-8, A2-9).

Cada PR: TDD → code review → ship (auto-merge com CI verde). `npx prettier
--write` nos ficheiros novos antes do ship (o repo usa `arrowParens: avoid`).

## Critérios de aceitação (do relatório A-2)

- [ ] `forgot-password` gera token hasheado com expiração; resposta não revela existência de conta.
- [ ] `reset-password` recusa token inválido/expirado/reutilizado e atualiza `passwordChangedAt`.
- [ ] `POST /auth/refresh` recusa um access token e exige refresh verificado com `JWT_REFRESH_SECRET`; rotação revoga o anterior.
- [ ] Reutilização de refresh revogado revoga a cadeia do utilizador.
- [ ] `DocShareLink.passwordHash` deixa de ser sha256 (bcrypt, compare em tempo constante).
- [ ] Login/forgot acima do limite dedicado devolvem 429.
- [ ] Registo/reset/change recusam senhas abaixo da política; login não impõe política.
- [ ] Access token emitido antes de um reset é recusado pelo `JwtStrategy`.
- [ ] Grep de `createHash` limpo nos caminhos de senha; audit log de login já não engole erros.
