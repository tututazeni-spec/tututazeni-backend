# Remediação A-2 (Autenticação, Tokens e Senhas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os achados da auditoria A-2 — recuperação de senha real, refresh token verificado com rotação, bcrypt nos share links, rate-limit no login, política de senha e higiene.

**Architecture:** Backend NestJS. Reset de senha via `PasswordResetToken` (token aleatório, hash sha256, uso único, 30 min) + `MailService` por interface (entrega abstraída). Refresh via cookie httpOnly dedicado, `RefreshTokenStrategy` que verifica com `JWT_REFRESH_SECRET`, persistência do hash em `RefreshToken` com rotação e deteção de reutilização. `User.passwordChangedAt` invalida access tokens antigos no `JwtStrategy`. Spec: `docs/superpowers/specs/2026-07-11-a2-auth-tokens-senhas-design.md`.

**Tech Stack:** NestJS + Passport + @nestjs/jwt, Prisma (PostgreSQL, extensão read-replicas), bcrypt, @nestjs/throttler, class-validator, Jest (`--forceExit`).

## Global Constraints

- **NUNCA correr `lint`, `format:check` ou `build` locais** — validação é do CI (check `quality` bloqueante). Correr apenas os specs Jest indicados: `npm run test -- <caminho>`.
- **Antes de qualquer ship**, correr `npx prettier --write` nos ficheiros novos/alterados (o repo usa `arrowParens: avoid`; código com `(x) =>` chumba o check `quality`).
- Hooks Husky: `git commit --no-verify` / `git push --no-verify` autorizados (máquina lenta).
- Rede instável: se `git push`/`gh` pendurar, usar `git -c http.version=HTTP/1.1 push --no-verify …` e repetir até 3× (sleep 10). Preferir a shell **Bash**.
- Jest arranca lento nesta máquina (3-6 min). Correr specs em foreground com timeout ≥10 min; não matar/re-tentar.
- Prisma: `this.prisma.user` etc. acedem ao primary (PrismaService extends PrismaClient); `this.prisma.read.X` = réplica de leitura; `this.prisma.db.$primary()` força primary. Padrão existente em `auth.service.ts`.
- Migrações: schema é expand-only (colunas nullable / tabelas novas) — compatível com rollback (runbook §6). Gerar SQL com `npx prisma migrate dev --name <nome> --create-only` e depois `npx prisma generate`; se a BD local não estiver acessível (P1001), escrever o SQL da migração à mão em `prisma/migrations/<timestamp>_<nome>/migration.sql` e correr só `npx prisma generate`. O deploy aplica com `prisma migrate deploy` (docker-entrypoint).
- Commits: Conventional Commits pt, terminados com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Working dir: `C:\Users\Placido Costa\innova`. Branch base já criada: `feat/a2-remediacao-auth-tokens` (contém o spec). PR-A trabalha nela; PR-B e PR-C criam branches próprias a partir da `main` já com PR-A merged.
- Segredos JWT: specs de auth definem `process.env.JWT_REFRESH_SECRET` num `beforeAll` (ver `auth.service.spec.ts`) — replicar onde necessário.

---

# PR-A — Migração + MailService + Reset de senha (A2-1)

Branch: `feat/a2-remediacao-auth-tokens` (a que tem o spec).

### Task A1: Schema — modelos de token e `passwordChangedAt`

**Files:**
- Modify: `prisma/schema.prisma` (modelo `User`; dois modelos novos no fim)
- Create: `prisma/migrations/<timestamp>_a2_auth_tokens/migration.sql`

**Interfaces:**
- Produces: modelos Prisma `PasswordResetToken` e `RefreshToken`; campo `User.passwordChangedAt DateTime?`. Usados por todas as tasks seguintes via `this.prisma.passwordResetToken` / `this.prisma.refreshToken`.

- [ ] **Step 1: Acrescentar as relações ao modelo User**

Em `prisma/schema.prisma`, no `model User { … }`, junto às outras relações (ex. depois de `refreshTokens`/antes do fecho `}`), acrescentar as três linhas:

```prisma
  passwordChangedAt   DateTime?
  passwordResetTokens PasswordResetToken[]
  refreshTokens       RefreshToken[]
```

- [ ] **Step 2: Acrescentar os dois modelos no fim do schema**

```prisma
model PasswordResetToken {
  id        Int       @id @default(autoincrement())
  userId    Int
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

model RefreshToken {
  id           Int       @id @default(autoincrement())
  userId       Int
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String    @unique
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById Int?
  createdAt    DateTime  @default(now())

  @@index([userId])
}
```

- [ ] **Step 3: Gerar migração + client**

Run: `npx prisma migrate dev --name a2_auth_tokens --create-only`
Se falhar com P1001 (BD inacessível), criar à mão `prisma/migrations/<timestamp>_a2_auth_tokens/migration.sql` com:

```sql
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Depois: `npx prisma generate`
Expected: client regenerado sem erros; `this.prisma.passwordResetToken` e `this.prisma.refreshToken` passam a existir nos tipos.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit --no-verify -m "feat(auth): schema de PasswordResetToken, RefreshToken e passwordChangedAt

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task A2: MailService (interface + impl. de log)

**Files:**
- Create: `src/mail/mail.service.ts`
- Create: `src/mail/mail.module.ts`
- Test: `src/mail/mail.service.spec.ts`

**Interfaces:**
- Produces: classe injetável `MailService` com `sendPasswordReset(email: string, token: string): Promise<void>`; `MailModule` que a exporta. Consumida pela Task A3.

- [ ] **Step 1: Write the failing test**

```typescript
// src/mail/mail.service.spec.ts
import { MailService } from './mail.service';

describe('MailService', () => {
  it('sendPasswordReset regista a intenção sem lançar (entrega abstraída)', async () => {
    const service = new MailService();
    const spy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    await expect(
      service.sendPasswordReset('user@innova.com', 'tok123'),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it('não inclui o token em texto no argumento logado (evita vazamento no log)', async () => {
    const service = new MailService();
    const spy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    await service.sendPasswordReset('user@innova.com', 'segredo-do-token');
    const logged = spy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).not.toContain('segredo-do-token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/mail/mail.service.spec.ts`
Expected: FAIL — `Cannot find module './mail.service'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/mail/mail.service.ts
// Entrega de email abstraída atrás desta interface. A implementação actual
// regista a intenção (mesmo padrão dos stubs de scalability.events.ts); um
// SmtpMailService real liga-se depois via os SMTP_* do .env.production sem
// mudar os chamadores. NUNCA registar o token em texto claro.
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordReset(email: string, token: string): Promise<void> {
    void token; // entregue ao utilizador, nunca logado
    this.logger.log(`Password reset solicitado para ${email} (token gerado, entrega pendente de SMTP)`);
  }
}
```

```typescript
// src/mail/mail.module.ts
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/mail/mail.service.spec.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/mail/mail.service.ts src/mail/mail.module.ts src/mail/mail.service.spec.ts
git commit --no-verify -m "feat(mail): MailService por interface com entrega abstraida

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task A3: PasswordResetService (forgot/reset)

**Files:**
- Create: `src/auth/password-reset.service.ts`
- Test: `src/auth/password-reset.service.spec.ts`

**Interfaces:**
- Consumes: `MailService.sendPasswordReset` (A2); `this.prisma.passwordResetToken`, `this.prisma.user`, `this.prisma.refreshToken` (A1).
- Produces: `PasswordResetService` com `forgotPassword(email: string): Promise<{ message: string }>` e `resetPassword(token: string, newPassword: string): Promise<{ message: string }>`. Consumida por `AuthService`/controller na Task A4.

- [ ] **Step 1: Write the failing test**

```typescript
// src/auth/password-reset.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('bcrypt-hash') }));

const GENERIC = 'Se o email existir, receberás instruções de recuperação';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('PasswordResetService', () => {
  const mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

  afterEach(() => jest.clearAllMocks());

  it('forgotPassword devolve mensagem genérica e cria token quando o user existe', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'u@i.com', active: true });
    const svc = new PasswordResetService(prisma as any, mail as any);

    const res = await svc.forgotPassword('u@i.com');

    expect(res.message).toBe(GENERIC);
    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    expect(mail.sendPasswordReset).toHaveBeenCalledWith('u@i.com', expect.any(String));
  });

  it('forgotPassword devolve a MESMA mensagem e não cria token quando o user não existe', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const svc = new PasswordResetService(prisma as any, mail as any);

    const res = await svc.forgotPassword('nao@existe.com');

    expect(res.message).toBe(GENERIC);
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('resetPassword rejeita token inexistente', async () => {
    const prisma = makePrisma();
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);
    const svc = new PasswordResetService(prisma as any, mail as any);

    await expect(svc.resetPassword('mau', 'NovaSenha123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resetPassword rejeita token já usado', async () => {
    const prisma = makePrisma();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1, userId: 1, usedAt: new Date(), expiresAt: new Date(Date.now() + 1e6),
    });
    const svc = new PasswordResetService(prisma as any, mail as any);

    await expect(svc.resetPassword('tok', 'NovaSenha123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resetPassword rejeita token expirado', async () => {
    const prisma = makePrisma();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1, userId: 1, usedAt: null, expiresAt: new Date(Date.now() - 1000),
    });
    const svc = new PasswordResetService(prisma as any, mail as any);

    await expect(svc.resetPassword('tok', 'NovaSenha123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resetPassword válido actualiza senha, passwordChangedAt, marca usedAt e revoga refresh', async () => {
    const prisma = makePrisma();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 5, userId: 7, usedAt: null, expiresAt: new Date(Date.now() + 1e6),
    });
    const svc = new PasswordResetService(prisma as any, mail as any);

    const res = await svc.resetPassword('tok', 'NovaSenha123');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ password: 'bcrypt-hash', passwordChangedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7, revokedAt: null } }),
    );
    expect(res.message).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/password-reset.service.spec.ts`
Expected: FAIL — `Cannot find module './password-reset.service'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/auth/password-reset.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const RESET_TTL_MS = 30 * 60 * 1000; // 30 min
const GENERIC_MESSAGE = 'Se o email existir, receberás instruções de recuperação';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Resposta genérica sempre — não revela se a conta existe (anti-enumeração).
    if (!user || !user.active) return { message: GENERIC_MESSAGE };

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await this.mail.sendPasswordReset(email, token);
    return { message: GENERIC_MESSAGE };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { password: hashed, passwordChangedAt: new Date() },
    });
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    // Reset invalida sessões: revoga refresh tokens activos do utilizador.
    await this.prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Senha redefinida com sucesso' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/auth/password-reset.service.spec.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/auth/password-reset.service.ts src/auth/password-reset.service.spec.ts
git commit --no-verify -m "feat(auth): PasswordResetService com token de uso unico e revogacao de refresh

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task A4: Ligar reset ao controller/módulo; remover stubs

**Files:**
- Modify: `src/auth/auth.service.ts:110-118` (remover stubs `forgotPassword`/`resetPassword`)
- Modify: `src/auth/auth.controller.ts:68-78` (delegar ao `PasswordResetService`)
- Modify: `src/auth/auth.module.ts` (registar `MailModule`, `PasswordResetService`)

**Interfaces:**
- Consumes: `PasswordResetService` (A3), `MailModule` (A2). DTOs `ForgotPasswordDto` (campo `email`) e `ResetPasswordDto` (campos `token`, `newPassword`) já existem em `auth.dto.ts`.

- [ ] **Step 1: Remover os stubs de `auth.service.ts`**

Apagar os métodos `forgotPassword(_dto)` e `resetPassword(_dto)` (linhas ~110-118) e remover `ForgotPasswordDto`/`ResetPasswordDto` do import se ficarem sem uso nesse ficheiro.

- [ ] **Step 2: Registar no módulo**

Em `src/auth/auth.module.ts`, importar e registar:

```typescript
import { MailModule } from '../mail/mail.module';
import { PasswordResetService } from './password-reset.service';
```

No `@Module`: acrescentar `MailModule` a `imports`, e `PasswordResetService` a `providers`.

- [ ] **Step 3: Delegar no controller**

Em `src/auth/auth.controller.ts`, injetar o serviço e apontar os endpoints:

```typescript
// no construtor:
constructor(
  private readonly authService: AuthService,
  private readonly passwordReset: PasswordResetService,
) {}

// substituir os handlers:
@Public()
@Post('forgot-password')
forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.passwordReset.forgotPassword(dto.email);
}

@Public()
@Post('reset-password')
resetPassword(@Body() dto: ResetPasswordDto) {
  return this.passwordReset.resetPassword(dto.token, dto.newPassword);
}
```

Acrescentar `import { PasswordResetService } from './password-reset.service';`.

- [ ] **Step 4: Confirmar a suite de auth verde**

Run: `npm run test -- src/auth src/mail`
Expected: PASS (auth.service.spec, auth.controller.spec se existir, password-reset.service.spec, mail.service.spec).

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.controller.ts src/auth/auth.module.ts
git commit --no-verify -m "feat(auth): liga forgot/reset-password ao PasswordResetService (remove stubs)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task A5: Ship PR-A

**Files:** nenhum novo.

- [ ] **Step 1: Prettier nos ficheiros novos**

Run: `npx prettier --write src/mail/*.ts src/auth/password-reset.service*.ts`
Depois `git add -A && git commit --no-verify -m "style: prettier nos ficheiros de reset de senha" --allow-empty` (só se houver mudanças).

- [ ] **Step 2: Review final + push + PR (o controller do SDD trata do review)**

```bash
git -c http.version=HTTP/1.1 push --no-verify -u origin feat/a2-remediacao-auth-tokens
gh pr create --title "feat(security): remediacao A-2 PR-A — reset de senha real (A2-1)" \
  --body "PR 1/3 da remediacao A-2 (spec docs/superpowers/specs/2026-07-11-a2-auth-tokens-senhas-design.md): modelos PasswordResetToken/RefreshToken + passwordChangedAt, MailService por interface, e fluxo forgot/reset-password real (token de uso unico 30min, resposta anti-enumeracao, revogacao de refresh no reset). Fecha A2-1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --auto --squash --delete-branch
```

Expected: auto-merge armado; CI valida. Confirmar `quality` verde (pode falhar em prettier — corrigir e re-push conforme Global Constraints).

---

# PR-B — Refresh token com rotação (A2-2, A2-6)

Branch nova a partir da `main` (com PR-A merged): `feat/a2-refresh-rotacao`.

### Task B1: Cookie do refresh em `token-cookie.ts`

**Files:**
- Modify: `src/auth/token-cookie.ts`
- Test: `src/auth/token-cookie.spec.ts` (acrescentar casos)

**Interfaces:**
- Produces: `REFRESH_COOKIE = 'refresh_token'` e `buildRefreshCookieOptions(isProd: boolean): CookieOptions` (path `/auth/refresh`, maxAge 7d). Consumidos pela Task B3.

- [ ] **Step 1: Write the failing test** (acrescentar ao spec existente)

```typescript
// src/auth/token-cookie.spec.ts — acrescentar
import { REFRESH_COOKIE, buildRefreshCookieOptions } from './token-cookie';

describe('refresh cookie', () => {
  it('o nome é refresh_token', () => {
    expect(REFRESH_COOKIE).toBe('refresh_token');
  });

  it('está limitado ao path /auth/refresh', () => {
    expect(buildRefreshCookieOptions(true).path).toBe('/auth/refresh');
  });

  it('exige secure/httpOnly em produção e sameSite lax; maxAge 7 dias', () => {
    const o = buildRefreshCookieOptions(true);
    expect(o.httpOnly).toBe(true);
    expect(o.secure).toBe(true);
    expect(o.sameSite).toBe('lax');
    expect(o.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('em dev não exige secure', () => {
    expect(buildRefreshCookieOptions(false).secure).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/token-cookie.spec.ts`
Expected: FAIL — `REFRESH_COOKIE`/`buildRefreshCookieOptions` não exportados.

- [ ] **Step 3: Write minimal implementation** (acrescentar a `token-cookie.ts`)

```typescript
export const REFRESH_COOKIE = 'refresh_token';

export function buildRefreshCookieOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/auth/refresh', // só viaja no endpoint de refresh
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/auth/token-cookie.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/token-cookie.ts src/auth/token-cookie.spec.ts
git commit --no-verify -m "feat(auth): cookie dedicado do refresh token (path /auth/refresh)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task B2: RefreshTokenStrategy + guard

**Files:**
- Create: `src/auth/refresh-token.strategy.ts`
- Create: `src/auth/refresh-token.guard.ts`
- Test: `src/auth/refresh-token.strategy.spec.ts`

**Interfaces:**
- Produces: `RefreshTokenStrategy` (passport, nome `'jwt-refresh'`) que extrai do cookie `refresh_token` e verifica com `JWT_REFRESH_SECRET`, devolvendo `{ id: number, email: string, refreshToken: string }`; `RefreshTokenGuard extends AuthGuard('jwt-refresh')`. Usados na Task B3.

- [ ] **Step 1: Write the failing test**

```typescript
// src/auth/refresh-token.strategy.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { refreshCookieExtractor } from './refresh-token.strategy';

describe('refreshCookieExtractor', () => {
  it('extrai o refresh_token do cookie', () => {
    const req = { cookies: { refresh_token: 'abc' } } as any;
    expect(refreshCookieExtractor(req)).toBe('abc');
  });

  it('devolve null quando não há cookie', () => {
    expect(refreshCookieExtractor({ cookies: {} } as any)).toBeNull();
    expect(refreshCookieExtractor({} as any)).toBeNull();
  });
});

describe('RefreshTokenStrategy.validate', () => {
  it('devolve id/email/refreshToken a partir do payload e do cookie', async () => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    const { RefreshTokenStrategy } = await import('./refresh-token.strategy');
    const strat = new RefreshTokenStrategy({ get: () => 'test-refresh-secret' } as any);
    const req = { cookies: { refresh_token: 'the-token' } } as any;
    const out = await strat.validate(req, { sub: 9, email: 'u@i.com' });
    expect(out).toEqual({ id: 9, email: 'u@i.com', refreshToken: 'the-token' });
  });

  it('recusa quando o cookie desapareceu entre a verificação e o validate', async () => {
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    const { RefreshTokenStrategy } = await import('./refresh-token.strategy');
    const strat = new RefreshTokenStrategy({ get: () => 'test-refresh-secret' } as any);
    await expect(
      strat.validate({ cookies: {} } as any, { sub: 9, email: 'u@i.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/refresh-token.strategy.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/auth/refresh-token.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export const refreshCookieExtractor: JwtFromRequestFunction = (req: Request) => {
  const cookies = (req?.cookies ?? {}) as Record<string, string | undefined>;
  return cookies.refresh_token ?? null;
};

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_REFRESH_SECRET não está definido — recusado por segurança. Configure a variável de ambiente.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([refreshCookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { sub: number; email: string }) {
    const token = refreshCookieExtractor(req);
    if (!token) throw new UnauthorizedException('Refresh token ausente');
    return { id: payload.sub, email: payload.email, refreshToken: token };
  }
}
```

```typescript
// src/auth/refresh-token.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class RefreshTokenGuard extends AuthGuard('jwt-refresh') {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/auth/refresh-token.strategy.spec.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/auth/refresh-token.strategy.ts src/auth/refresh-token.guard.ts src/auth/refresh-token.strategy.spec.ts
git commit --no-verify -m "feat(auth): RefreshTokenStrategy e guard (verifica JWT_REFRESH_SECRET via cookie)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task B3: Persistência + rotação no AuthService; wiring do controller

**Files:**
- Modify: `src/auth/auth.service.ts` (`generateTokens` persiste refresh; novo `rotateRefreshToken`; `login`/`register` persistem; `logout` revoga)
- Modify: `src/auth/auth.controller.ts` (define/limpa cookie de refresh; `/auth/refresh` usa `RefreshTokenGuard`)
- Modify: `src/auth/auth.module.ts` (registar `RefreshTokenStrategy`)
- Test: `src/auth/auth.service.spec.ts` (acrescentar casos de rotação)

**Interfaces:**
- Consumes: `RefreshTokenGuard` (B2), `REFRESH_COOKIE`/`buildRefreshCookieOptions` (B1), `this.prisma.refreshToken` (A1).
- Produces: `AuthService.rotateRefreshToken(userId: number, email: string, presentedRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }>` que lança `UnauthorizedException` em token desconhecido/revogado (revogando a cadeia). `login`/`register` passam a devolver também `refreshToken` persistido.

- [ ] **Step 1: Write the failing test** (acrescentar a `auth.service.spec.ts`; requer `refreshToken` no mockPrisma)

Acrescentar ao `mockPrisma` as chaves:
```typescript
  refreshToken: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
```

E os testes:
```typescript
describe('rotateRefreshToken', () => {
  const crypto = require('crypto');
  const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

  it('roda: revoga o token apresentado e emite um novo par', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 3, userId: 1, revokedAt: null, expiresAt: new Date(Date.now() + 1e6),
    });
    const out = await service.rotateRefreshToken(1, 'test@innova.com', 'present');
    expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3 }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
    expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
    expect(out.accessToken).toBeDefined();
    expect(out.refreshToken).toBeDefined();
  });

  it('token desconhecido revoga a cadeia do utilizador e lança', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.rotateRefreshToken(1, 'test@innova.com', 'roubado')).rejects.toBeDefined();
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1, revokedAt: null } }),
    );
  });

  it('token já revogado (reutilização) revoga a cadeia e lança', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 4, userId: 1, revokedAt: new Date(), expiresAt: new Date(Date.now() + 1e6),
    });
    await expect(service.rotateRefreshToken(1, 'test@innova.com', 'reuse')).rejects.toBeDefined();
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/auth.service.spec.ts`
Expected: FAIL — `service.rotateRefreshToken is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `src/auth/auth.service.ts`, acrescentar `import * as crypto from 'crypto';` e reescrever/estender a emissão. `generateTokens` passa a persistir o hash do refresh:

```typescript
  private async persistRefreshToken(userId: number, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async rotateRefreshToken(userId: number, email: string, presented: string) {
    const hash = crypto.createHash('sha256').update(presented).digest('hex');
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    // Token desconhecido ou já revogado => possível reutilização de token roubado.
    if (!record || record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token inválido');
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const tokens = await this.generateTokens(userId, email);
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    await this.persistRefreshToken(userId, tokens.refreshToken);
    return tokens;
  }

  async revokeRefreshToken(presented: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(presented).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
```

Em `login` e `register`, após `generateTokens`, chamar `await this.persistRefreshToken(user.id, tokens.refreshToken);`. Remover o antigo `refreshToken(userId, email)` que só reemitia (substituído por `rotateRefreshToken`). Garantir que `UnauthorizedException` está importado (já está).

- [ ] **Step 4: Wiring do controller + módulo**

Em `src/auth/auth.module.ts`: `import { RefreshTokenStrategy } from './refresh-token.strategy';` e acrescentar a `providers`.

Em `src/auth/auth.controller.ts`:
- Importar `REFRESH_COOKIE, buildRefreshCookieOptions` de `./token-cookie`, `RefreshTokenGuard` de `./refresh-token.guard`.
- `const refreshCookieOptions = buildRefreshCookieOptions(process.env.NODE_ENV === 'production');`
- `login`: após definir o cookie de access, `res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);`
- Reescrever `refresh`:
```typescript
@Public()
@Post('refresh')
@UseGuards(RefreshTokenGuard)
async refresh(
  @Req() req: Request & { user: { id: number; email: string; refreshToken: string } },
  @Res({ passthrough: true }) res: Response,
) {
  const result = await this.authService.rotateRefreshToken(
    req.user.id, req.user.email, req.user.refreshToken,
  );
  res.cookie(TOKEN_COOKIE, result.accessToken, tokenCookieOptions);
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  return result;
}
```
- `logout`: ler o cookie e revogar antes de limpar:
```typescript
@Public()
@Post('logout')
@HttpCode(200)
async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  const presented = (req.cookies ?? {}).refresh_token;
  if (presented) await this.authService.revokeRefreshToken(presented);
  res.clearCookie(TOKEN_COOKIE, { ...tokenCookieOptions, maxAge: undefined });
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  return { message: 'Sessão terminada' };
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/auth`
Expected: PASS (auth.service.spec com os casos de rotação, token-cookie.spec, refresh-token.strategy.spec).

- [ ] **Step 6: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.controller.ts src/auth/auth.module.ts src/auth/auth.service.spec.ts
git commit --no-verify -m "feat(auth): refresh token persistido com rotacao e deteccao de reutilizacao

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task B4: `passwordChangedAt` no JwtStrategy + TTL do cache

**Files:**
- Modify: `src/auth/jwt.strategy.ts`
- Test: `src/auth/jwt.strategy.spec.ts` (acrescentar casos)

**Interfaces:**
- Consumes: `User.passwordChangedAt` (A1).
- Produces: `validate()` recusa payload cujo `iat` seja anterior a `passwordChangedAt`.

- [ ] **Step 1: Write the failing test** (acrescentar ao spec)

```typescript
// src/auth/jwt.strategy.spec.ts — acrescentar
it('recusa access token emitido antes de passwordChangedAt', async () => {
  // arrange: mockar prisma.user.findUnique para devolver user activo com
  // passwordChangedAt no futuro face ao iat do token.
  const iatSeconds = Math.floor(Date.now() / 1000) - 100;
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 1, active: true, passwordChangedAt: new Date(Date.now()), // depois do iat
    role: { permissions: [] }, unit: null, department: null, position: null,
  });
  await expect(
    strategy.validate({ sub: 1, email: 'u@i.com', iat: iatSeconds } as any),
  ).rejects.toBeDefined();
});

it('aceita access token emitido depois de passwordChangedAt', async () => {
  const iatSeconds = Math.floor(Date.now() / 1000);
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 1, active: true, passwordChangedAt: new Date(Date.now() - 60000),
    role: { permissions: [] }, unit: null, department: null, position: null,
  });
  const out = await strategy.validate({ sub: 1, email: 'u@i.com', iat: iatSeconds } as any);
  expect(out).toBeDefined();
});
```

> Nota: se `jwt.strategy.spec.ts` não existir ainda com este harness, criar o describe com `mockPrisma`/`ConfigService` no mesmo padrão de `auth.service.spec.ts` (mock de `prisma.user.findUnique`, `new JwtStrategy(mockPrisma, { get: () => 'secret' })`), limpando o `userCache` entre testes (nova instância por teste).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/jwt.strategy.spec.ts`
Expected: FAIL — o token antigo é aceite (sem verificação de `passwordChangedAt`).

- [ ] **Step 3: Write minimal implementation**

Em `src/auth/jwt.strategy.ts`, alterar a assinatura de `validate` para receber `iat` e verificar. Também reduzir o TTL default do cache para 30s e não cachear o resultado antes da verificação de `iat`:

```typescript
async validate(payload: { sub: number; email: string; iat?: number }) {
  const cached = this.userCache.get(payload.sub);
  const user = cached && cached.expiresAt > Date.now()
    ? cached.user
    : await this.loadUser(payload.sub);

  // Access token emitido antes de uma alteração de senha é inválido.
  if (user.passwordChangedAt && payload.iat &&
      payload.iat * 1000 < new Date(user.passwordChangedAt).getTime()) {
    this.userCache.delete(payload.sub);
    throw new UnauthorizedException('Sessão expirada por alteração de senha');
  }
  return user;
}

private async loadUser(sub: number) {
  const user = await this.prisma.user.findUnique({
    where: { id: sub },
    include: { role: { include: { permissions: true } }, unit: true, department: true, position: true },
  });
  if (!user || !user.active) {
    this.userCache.delete(sub);
    throw new UnauthorizedException('Utilizador inativo ou não encontrado');
  }
  this.userCache.set(sub, { user, expiresAt: Date.now() + this.cacheTtlMs });
  return user;
}
```

E mudar o default do TTL: `parseInt(process.env.JWT_USER_CACHE_TTL_MS || '30000', 10)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/auth/jwt.strategy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/jwt.strategy.ts src/auth/jwt.strategy.spec.ts
git commit --no-verify -m "feat(auth): JwtStrategy invalida tokens anteriores a passwordChangedAt; TTL cache 30s

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task B5: Ship PR-B

- [ ] **Step 1: Prettier + push + PR**

```bash
npx prettier --write src/auth/refresh-token.strategy.ts src/auth/refresh-token.guard.ts
git add -A && git commit --no-verify -m "style: prettier no refresh strategy/guard" --allow-empty
git -c http.version=HTTP/1.1 push --no-verify -u origin feat/a2-refresh-rotacao
gh pr create --title "feat(security): remediacao A-2 PR-B — refresh token com rotacao (A2-2, A2-6)" \
  --body "PR 2/3 da remediacao A-2: cookie dedicado de refresh (path /auth/refresh), RefreshTokenStrategy que verifica JWT_REFRESH_SECRET, persistencia com rotacao e deteccao de reutilizacao (revoga a cadeia), e passwordChangedAt no JwtStrategy a invalidar access tokens antigos. Fecha A2-2 e A2-6.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --auto --squash --delete-branch
```

---

# PR-C — Share links, rate-limit, política, Bearer, higiene (A2-3,4,5,7,8,9)

Branch nova a partir da `main` (com PR-B merged): `feat/a2-hardening-final`.

### Task C1: bcrypt nos share links (A2-3)

**Files:**
- Modify: `src/document-repository/document-repository.service.ts:424,461`
- Test: `src/document-repository/document-repository.service.spec.ts` (ou novo spec do helper)

**Interfaces:**
- Produces: helpers `hashSharePassword(pw: string): Promise<string>` e `verifySharePassword(pw: string, hash: string): Promise<boolean>` no mesmo ficheiro (ou secção de utilitários), usando bcrypt cost 12.

- [ ] **Step 1: Write the failing test**

```typescript
// src/document-repository/share-password.spec.ts
import { hashSharePassword, verifySharePassword } from './share-password';

describe('share link password hashing', () => {
  it('produz um hash bcrypt (não sha256 hex de 64 chars)', async () => {
    const hash = await hashSharePassword('segredo');
    expect(hash).toMatch(/^\$2[aby]\$/); // prefixo bcrypt
    expect(hash).not.toMatch(/^[a-f0-9]{64}$/); // não é sha256
  });

  it('verifica correctamente a senha certa e recusa a errada', async () => {
    const hash = await hashSharePassword('segredo');
    expect(await verifySharePassword('segredo', hash)).toBe(true);
    expect(await verifySharePassword('errada', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/document-repository/share-password.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/document-repository/share-password.ts
// Share links guardam senha com bcrypt (A2-3) — não sha256 sem salt.
import * as bcrypt from 'bcrypt';

export function hashSharePassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifySharePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Usar os helpers no serviço**

Em `document-repository.service.ts`:
- `import { hashSharePassword, verifySharePassword } from './share-password';`
- `createShareLink` (~linha 424): substituir
  `const hashedPass = dto.password ? crypto.createHash('sha256').update(dto.password).digest('hex') : null;`
  por `const hashedPass = dto.password ? await hashSharePassword(dto.password) : null;`
- `resolveShareLink` (~linha 461): substituir o bloco que compara `sha256(password) !== link.passwordHash` por:
  ```typescript
  if (link.passwordHash) {
    const ok = await verifySharePassword(password ?? '', link.passwordHash);
    if (!ok) throw new ForbiddenException('Password incorrecta');
  }
  ```

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/document-repository`
Expected: PASS (share-password.spec + specs existentes do módulo verdes).

- [ ] **Step 6: Commit**

```bash
git add src/document-repository/share-password.ts src/document-repository/share-password.spec.ts src/document-repository/document-repository.service.ts
git commit --no-verify -m "fix(security): share links com bcrypt em vez de sha256 sem salt (A2-3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task C2: Rate-limit dedicado no login/forgot (A2-4)

**Files:**
- Modify: `src/auth/auth.controller.ts` (decorador `@Throttle` em `login` e `forgot-password`)
- Test: `src/auth/auth.controller.spec.ts` (verificar metadata do throttle) — se não existir harness, cobrir via nota

**Interfaces:**
- Consumes: `@nestjs/throttler` (já é `APP_GUARD` global).

- [ ] **Step 1: Write the failing test**

```typescript
// src/auth/auth.controller.spec.ts — acrescentar (metadata-based, sem HTTP real)
import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';

it('login tem throttle dedicado apertado (<= 10/min)', () => {
  const reflector = new Reflector();
  // @nestjs/throttler guarda metadata sob a chave 'THROTTLER:LIMIT' por método
  const meta = Reflect.getMetadata('THROTTLER:default', AuthController.prototype.login)
    ?? Reflect.getMetadata('__throttler__', AuthController.prototype.login);
  expect(meta).toBeDefined();
});
```

> Se a introspeção de metadata do throttler for frágil na versão instalada, substituir por um teste e2e leve que faz 6 POSTs a `/auth/login` e espera um `429` no 6º (usar `SMOKE`/supertest se disponível). O objetivo verificável é: acima de 5/min → 429.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/auth.controller.spec.ts`
Expected: FAIL — sem metadata de throttle no `login`.

- [ ] **Step 3: Write minimal implementation**

Em `src/auth/auth.controller.ts`:
- `import { Throttle } from '@nestjs/throttler';`
- Antes de `login`: `@Throttle({ default: { limit: 5, ttl: 60000 } })`
- Antes de `forgotPassword`: `@Throttle({ default: { limit: 5, ttl: 60000 } })`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/auth/auth.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.controller.ts src/auth/auth.controller.spec.ts
git commit --no-verify -m "feat(security): rate-limit dedicado (5/min) em login e forgot-password (A2-4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task C3: Validador de política de senha (A2-5)

**Files:**
- Create: `src/common/validators/strong-password.decorator.ts`
- Test: `src/common/validators/strong-password.decorator.spec.ts`
- Modify: `src/auth/auth.dto.ts` (aplicar a `RegisterDto`, `ChangePasswordDto`, `ResetPasswordDto`)

**Interfaces:**
- Produces: decorator `IsStrongPassword()` (class-validator) que exige ≥10 chars, ao menos 1 minúscula, 1 maiúscula, 1 dígito. Aplicado aos DTOs de escrita de senha (não ao `LoginDto`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/common/validators/strong-password.decorator.spec.ts
import { validate } from 'class-validator';
import { IsStrongPassword } from './strong-password.decorator';

class Dto {
  @IsStrongPassword()
  password!: string;
}

async function errorsFor(pw: string) {
  const d = new Dto();
  d.password = pw;
  return validate(d);
}

describe('IsStrongPassword', () => {
  it('aceita uma senha forte', async () => {
    expect(await errorsFor('SenhaForte123')).toHaveLength(0);
  });
  it('recusa curta (<10)', async () => {
    expect((await errorsFor('Ab1')).length).toBeGreaterThan(0);
  });
  it('recusa sem maiúscula', async () => {
    expect((await errorsFor('senhaforte123')).length).toBeGreaterThan(0);
  });
  it('recusa sem dígito', async () => {
    expect((await errorsFor('SenhaForteAbc')).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/common/validators/strong-password.decorator.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/common/validators/strong-password.decorator.ts
// Política de senha (A2-5): >=10 chars, minúscula + maiúscula + dígito.
// Aplicar a registo/reset/change — NUNCA ao login (aí só se validam credenciais).
import { registerDecorator, ValidationOptions } from 'class-validator';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;

export function IsStrongPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && STRONG.test(value),
        defaultMessage: () =>
          'A senha deve ter pelo menos 10 caracteres, incluindo minúscula, maiúscula e dígito',
      },
    });
  };
}
```

- [ ] **Step 4: Aplicar aos DTOs**

Em `src/auth/auth.dto.ts`, substituir `@MinLength(6)` por `@IsStrongPassword()` (mantendo `@IsString()`) em: `RegisterDto.password`, `ChangePasswordDto.newPassword`, `ResetPasswordDto.newPassword`. **Não** tocar em `LoginDto.password`. Acrescentar `import { IsStrongPassword } from '../common/validators/strong-password.decorator';` e remover `MinLength` do import se ficar sem uso.

- [ ] **Step 5: Run tests**

Run: `npm run test -- src/common/validators src/auth/auth.service.spec.ts`
Expected: PASS (o validador; e a suite de auth não regride — os mocks usam senhas fortes ou não passam pelo pipe).

- [ ] **Step 6: Commit**

```bash
git add src/common/validators/strong-password.decorator.ts src/common/validators/strong-password.decorator.spec.ts src/auth/auth.dto.ts
git commit --no-verify -m "feat(security): politica de senha forte em registo/reset/change (A2-5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task C4: Bearer desligável + higiene (A2-7, A2-9)

**Files:**
- Modify: `src/auth/jwt.strategy.ts` (fallback Bearer atrás de `AUTH_ALLOW_BEARER`)
- Modify: `src/auth/auth.service.ts` (audit log de login com `logger.warn` em vez de `.catch(() => undefined)`)
- Modify: `.env.example` (documentar `AUTH_ALLOW_BEARER`)
- Test: `src/auth/jwt.strategy.spec.ts` (extractors conforme flag)

**Interfaces:**
- Consumes: nada novo.

- [ ] **Step 1: Write the failing test** (acrescentar)

```typescript
// src/auth/jwt.strategy.spec.ts — acrescentar
import { buildJwtExtractors } from './jwt.strategy';

it('inclui o fallback Bearer quando AUTH_ALLOW_BEARER != false', () => {
  expect(buildJwtExtractors(true)).toHaveLength(2);
});
it('só o cookie quando AUTH_ALLOW_BEARER=false', () => {
  expect(buildJwtExtractors(false)).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/jwt.strategy.spec.ts`
Expected: FAIL — `buildJwtExtractors` não exportado.

- [ ] **Step 3: Write minimal implementation**

Em `src/auth/jwt.strategy.ts`, extrair a construção dos extractors:

```typescript
export function buildJwtExtractors(allowBearer: boolean): JwtFromRequestFunction[] {
  const extractors: JwtFromRequestFunction[] = [cookieExtractor];
  if (allowBearer) extractors.push(ExtractJwt.fromAuthHeaderAsBearerToken());
  return extractors;
}
```

E no `super({ ... })`: `jwtFromRequest: ExtractJwt.fromExtractors(buildJwtExtractors(process.env.AUTH_ALLOW_BEARER !== 'false'))`.

Em `src/auth/auth.service.ts`, substituir o `.catch(() => undefined)` do audit log de login por:
```typescript
      .catch((err) => this.logger.warn(`Falha ao registar audit log de login: ${err?.message ?? err}`));
```
(Acrescentar `private readonly logger = new Logger(AuthService.name);` e `import { Logger } from '@nestjs/common';` se ainda não existir.)

Em `.env.example`, acrescentar após o bloco JWT:
```bash
# Aceitar Authorization: Bearer além do cookie httpOnly (Swagger/clientes legados).
# Pôr a false quando o cookie for o canal único e o Swagger tiver auth própria.
AUTH_ALLOW_BEARER=true
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/auth/jwt.strategy.spec.ts src/auth/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/jwt.strategy.ts src/auth/auth.service.ts .env.example
git commit --no-verify -m "feat(security): fallback Bearer desligavel e audit log de login com warn (A2-7, A2-9)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task C5: Seed força troca no 1º login (A2-8)

**Files:**
- Modify: `prisma/seed.ts:45-67` (contas semente com `accountStatus: 'PENDING'`)

**Interfaces:** nenhuma (script de seed).

- [ ] **Step 1: Aplicar**

Em `prisma/seed.ts`, nas criações do admin e do employee, acrescentar `accountStatus: 'PENDING'` ao `data` (o default do schema é `'PENDING'`, mas explicitar deixa a intenção clara e cobre `upsert` com `update`). Se o seed usar `upsert`, garantir que o `create` inclui `accountStatus: 'PENDING'`.

- [ ] **Step 2: Verificar que o seed ainda tipa/compila via spec de sanidade**

Não há teste dedicado ao seed; confirmar visualmente e deixar o CI (build) validar. Não correr o seed contra a BD.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit --no-verify -m "chore(seed): contas semente com accountStatus PENDING (troca no 1o login) (A2-8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task C6: Ship PR-C

- [ ] **Step 1: Prettier + push + PR**

```bash
npx prettier --write src/document-repository/share-password.ts src/common/validators/strong-password.decorator.ts
git add -A && git commit --no-verify -m "style: prettier nos utilitarios de seguranca" --allow-empty
git -c http.version=HTTP/1.1 push --no-verify -u origin feat/a2-hardening-final
gh pr create --title "feat(security): remediacao A-2 PR-C — share links bcrypt, rate-limit, politica de senha (A2-3..9)" \
  --body "PR 3/3 da remediacao A-2: share links com bcrypt (A2-3), rate-limit dedicado 5/min em login/forgot (A2-4), politica de senha forte em registo/reset/change (A2-5), fallback Bearer desligavel (A2-7), seed com troca no 1o login (A2-8) e audit log de login com warn (A2-9).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --auto --squash --delete-branch
```

---

## Verificação pós-deploy (fica no runbook; não bloqueia as PRs)

Com a BD migrada: `forgot-password` de email inexistente e existente devolvem a mesma resposta; `reset-password` com token expirado dá 400; após reset, o access token antigo dá 401; `/auth/refresh` sem cookie de refresh dá 401 e com refresh válido roda o par; 6º login falhado no mesmo minuto dá 429; criar share link com senha e resolvê-lo com a senha certa/errada.

## Self-review (coberto)

- Spec §1 schema → Task A1. §2 reset → A2/A3/A4. §3 refresh → B1/B2/B3. §4 A2-3→C1, A2-4→C2, A2-5→C3, A2-6→B4, A2-7→C4, A2-8→C5, A2-9→C4. Todos os critérios de aceitação do spec mapeados.
- Tipos consistentes: `rotateRefreshToken(userId, email, presented)`, `PasswordResetService.forgotPassword(email)`/`resetPassword(token, newPassword)`, `REFRESH_COOKIE`/`buildRefreshCookieOptions`, `buildJwtExtractors`, `hashSharePassword`/`verifySharePassword`, `IsStrongPassword` — usados com os mesmos nomes em todas as tasks.
