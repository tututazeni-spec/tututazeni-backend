# Faixa A-Auth — Hardening de Autenticação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 4 lacunas de autenticação: implementar SMTP real no MailService, substituir `Math.random()` por CSPRNG na criação de convites, apertar throttle de password reset, e documentar geração de segredos JWT de produção.

**Architecture:** `MailService` (stub) é substituído por implementação `nodemailer` com degradação graciosa — sem `SMTP_HOST`, o service regista `warn` em vez de lançar. `UsersService.invite()` passa a usar `crypto.randomBytes` e a chamar `sendUserInvite` antes de criar o utilizador na BD. O throttle de `forgot-password`/`reset-password` passa de 5 req/60s para 3 req/hora com uma constante dedicada.

**Tech Stack:** NestJS, nodemailer, crypto (Node.js stdlib), Jest, Joi

## Global Constraints

- Campo `fullName` em todos os User — nunca `name`
- `MailService` mantém a assinatura de `sendPasswordReset(email, token)` sem alteração
- `tempPassword` nunca aparece em logs nem no response de qualquer endpoint
- SMTP vars são **opcionais** no schema Joi — o boot não falha sem elas
- `PASSWORD_RESET_THROTTLE` definido em `src/auth/auth.controller.ts` (mesmo ficheiro das outras constantes de throttle) — não criar novo ficheiro
- Testes correm com `npx jest --testPathPattern=<ficheiro> --no-coverage`

---

### Task 1: MailService com nodemailer real

**Files:**
- Modify: `src/mail/mail.service.ts` (substituição completa do stub)
- Modify: `src/mail/mail.service.spec.ts` (substituição completa dos testes)

**Interfaces:**
- Produces:
  - `MailService.sendPasswordReset(email: string, token: string): Promise<void>` — mantém assinatura existente
  - `MailService.sendUserInvite(email: string, fullName: string, tempPassword: string): Promise<void>` — novo método usado pela Task 2

- [ ] **Step 1: Instalar dependências**

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Verificar que aparecem em `package.json`:
```bash
grep nodemailer package.json
```
Expected: duas linhas — `"nodemailer"` em dependencies e `"@types/nodemailer"` em devDependencies.

- [ ] **Step 2: Escrever os testes novos (RED)**

Substituir `src/mail/mail.service.spec.ts` integralmente:

```typescript
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(() => {
    service = new MailService();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  describe('sem SMTP configurado (SMTP_HOST ausente)', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('sendPasswordReset resolve sem lançar e regista warn', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await expect(service.sendPasswordReset('user@innova.com', 'tok123')).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SMTP não configurado'));
    });

    it('sendUserInvite resolve sem lançar e regista warn', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await expect(
        service.sendUserInvite('novo@innova.com', 'João Silva', 'abc123def456'),
      ).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SMTP não configurado'));
    });

    it('token de reset nunca aparece nos logs', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await service.sendPasswordReset('user@innova.com', 'segredo-do-token');
      const logged = spy.mock.calls.map(c => String(c[0])).join(' ');
      expect(logged).not.toContain('segredo-do-token');
    });
  });

  describe('com SMTP configurado', () => {
    let sendMailMock: jest.Mock;

    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'test@test.com';
      process.env.SMTP_PASS = 'testpass';
      service.onModuleInit();
      sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
      (service as any).transporter = { sendMail: sendMailMock };
    });

    afterEach(() => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    });

    it('sendUserInvite envia para o email correcto com subject de boas-vindas', async () => {
      await service.sendUserInvite('novo@innova.com', 'João Silva', 'abc123def456');
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'novo@innova.com',
          subject: expect.stringContaining('Bem-vindo'),
        }),
      );
    });

    it('sendUserInvite inclui fullName e tempPassword no body', async () => {
      await service.sendUserInvite('novo@innova.com', 'João Silva', 'abc123def456');
      const { text } = sendMailMock.mock.calls[0][0] as { text: string };
      expect(text).toContain('João Silva');
      expect(text).toContain('abc123def456');
    });

    it('sendUserInvite lança se o transporter rejeitar', async () => {
      sendMailMock.mockRejectedValue(new Error('SMTP connection refused'));
      await expect(
        service.sendUserInvite('x@y.com', 'X', 'pass'),
      ).rejects.toThrow('SMTP connection refused');
    });

    it('sendPasswordReset lança se o transporter rejeitar', async () => {
      sendMailMock.mockRejectedValue(new Error('auth failed'));
      await expect(service.sendPasswordReset('x@y.com', 'token')).rejects.toThrow('auth failed');
    });
  });
});
```

- [ ] **Step 3: Verificar que os testes falham (RED)**

```bash
npx jest --testPathPattern=mail.service.spec --no-coverage
```

Expected: falham com `TypeError: service.onModuleInit is not a function` ou `sendUserInvite is not a function`.

- [ ] **Step 4: Implementar o `MailService` real**

Substituir `src/mail/mail.service.ts` integralmente:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  onModuleInit(): void {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.warn('SMTP_HOST não definido — emails não serão enviados');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    void token; // nunca logado — entregue ao utilizador apenas via link
    await this.send({
      to: email,
      subject: 'INNOVA — Recuperação de password',
      text: [
        'Recebemos um pedido de recuperação de password.',
        '',
        `Use este link para redefinir a sua password: ${process.env.APP_URL ?? ''}/auth/reset-password?token=${token}`,
        '',
        'Se não solicitou este pedido, ignore este email.',
        '',
        '-- Sistema INNOVA',
      ].join('\n'),
    });
  }

  async sendUserInvite(email: string, fullName: string, tempPassword: string): Promise<void> {
    await this.send({
      to: email,
      subject: 'Bem-vindo ao INNOVA — acesso à sua conta',
      text: [
        `Olá ${fullName},`,
        '',
        'A sua conta foi criada no sistema INNOVA.',
        `Email: ${email}`,
        `Password temporária: ${tempPassword}`,
        '',
        'Por favor aceda e altere a sua password no primeiro login.',
        '',
        '-- Sistema INNOVA',
      ].join('\n'),
    });
  }

  private async send(options: Mail.Options): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Email não enviado (SMTP não configurado): ${String(options.to)}`);
      return;
    }
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'INNOVA <noreply@innova.ao>',
      ...options,
    });
  }
}
```

- [ ] **Step 5: Verificar que os testes passam (GREEN)**

```bash
npx jest --testPathPattern=mail.service.spec --no-coverage
```

Expected: `Tests: 7 passed, 7 total`

- [ ] **Step 6: Commit**

```bash
git add src/mail/mail.service.ts src/mail/mail.service.spec.ts package.json package-lock.json
git commit -m "feat(mail): implementar MailService com nodemailer — sendUserInvite + degradação graciosa sem SMTP"
```

---

### Task 2: UsersModule wire + invite() com CSPRNG

**Files:**
- Modify: `src/users/users.module.ts` (importar MailModule)
- Modify: `src/users/users.service.ts` (injectar MailService, CSPRNG, chamar sendUserInvite)
- Modify: `src/users/users.service.spec.ts` (adicionar testes para invite())

**Interfaces:**
- Consumes: `MailService.sendUserInvite(email, fullName, tempPassword)` da Task 1
- Produces: `UsersService.invite(dto)` — usa CSPRNG, envia email antes de criar user

- [ ] **Step 1: Escrever testes para invite() (RED)**

Adicionar no fim de `src/users/users.service.spec.ts`, antes do último `});`:

```typescript
  describe('invite()', () => {
    const mockMail = {
      sendUserInvite: jest.fn().mockResolvedValue(undefined),
    };

    let serviceWithMail: UsersService;

    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: 'MailService', useValue: mockMail },
        ],
      }).compile();
      serviceWithMail = module.get<UsersService>(UsersService);
    });

    it('gera tempPassword com 24 chars hexadecimais (CSPRNG)', async () => {
      userMock.findUnique.mockResolvedValue(null);
      userMock.create.mockResolvedValue({ id: 1, email: 'novo@innova.com', fullName: 'Novo User' });

      await serviceWithMail.invite({
        email: 'novo@innova.com',
        fullName: 'Novo User',
        roleId: 1,
        departmentId: 1,
      });

      const [, , tempPassword] = mockMail.sendUserInvite.mock.calls[0] as [string, string, string];
      expect(tempPassword).toHaveLength(24);
      expect(tempPassword).toMatch(/^[0-9a-f]{24}$/);
    });

    it('chama sendUserInvite com email e fullName correctos', async () => {
      userMock.findUnique.mockResolvedValue(null);
      userMock.create.mockResolvedValue({ id: 2, email: 'x@innova.com', fullName: 'Ana Costa' });

      await serviceWithMail.invite({
        email: 'x@innova.com',
        fullName: 'Ana Costa',
        roleId: 1,
        departmentId: 1,
      });

      expect(mockMail.sendUserInvite).toHaveBeenCalledWith('x@innova.com', 'Ana Costa', expect.any(String));
    });

    it('lança ConflictException se email já existe', async () => {
      userMock.findUnique.mockResolvedValue({ id: 99 });
      await expect(
        serviceWithMail.invite({ email: 'dup@innova.com', fullName: 'Dup', roleId: 1, departmentId: 1 }),
      ).rejects.toThrow(ConflictException);
      expect(mockMail.sendUserInvite).not.toHaveBeenCalled();
    });

    it('não cria o utilizador se sendUserInvite lançar (SMTP configurado mas falha)', async () => {
      mockMail.sendUserInvite.mockRejectedValueOnce(new Error('SMTP timeout'));
      userMock.findUnique.mockResolvedValue(null);

      await expect(
        serviceWithMail.invite({ email: 'fail@innova.com', fullName: 'Fail', roleId: 1, departmentId: 1 }),
      ).rejects.toThrow('SMTP timeout');

      expect(userMock.create).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Verificar que os testes falham (RED)**

```bash
npx jest --testPathPattern=users.service.spec --no-coverage 2>&1 | tail -20
```

Expected: falham porque `MailService` não está injectado em `UsersService`.

- [ ] **Step 3: Importar MailModule em UsersModule**

Substituir `src/users/users.module.ts` integralmente:

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Actualizar UsersService — injectar MailService e corrigir invite()**

No topo de `src/users/users.service.ts`, adicionar o import do MailService:

```typescript
import { MailService } from '../mail/mail.service';
```

E adicionar `import * as crypto from 'crypto';` (se ainda não existir).

No constructor do `UsersService`, injectar o `MailService`. Localizar o constructor e adicionar o parâmetro. Exemplo do padrão existente:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly mail: MailService,
) {}
```

Substituir o método `invite()` (linhas 536-558) por:

```typescript
async invite(dto: InviteUserDto) {
  // Guard de unicidade antes da escrita: força primary.
  const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
  if (exists) throw new ConflictException('Email já registado');

  // CSPRNG — 12 bytes = 24 chars hexadecimais
  const tempPassword = crypto.randomBytes(12).toString('hex');

  // Enviar email ANTES de criar o user — se SMTP falhar, o user não é criado
  await this.mail.sendUserInvite(dto.email, dto.fullName, tempPassword);

  const user = await this.create({
    ...dto,
    password: tempPassword,
    accountStatus: AccountStatus.PENDING,
  });

  await this.prisma.notificationLog
    .create({
      data: {
        userId: (user as any).id,
        type: 'INVITE_SENT',
        message: `Convite enviado para ${dto.email}`,
      },
    })
    .catch(() => {});

  return { message: 'Convite enviado', userId: (user as any).id };
}
```

- [ ] **Step 5: Verificar que os testes passam (GREEN)**

```bash
npx jest --testPathPattern=users.service.spec --no-coverage 2>&1 | tail -10
```

Expected: `Tests: X passed` (todos os testes existentes + os 4 novos).

- [ ] **Step 6: Commit**

```bash
git add src/users/users.module.ts src/users/users.service.ts src/users/users.service.spec.ts
git commit -m "feat(users): substituir Math.random() por CSPRNG e enviar email de convite via MailService"
```

---

### Task 3: Throttle de password reset + env schema + .env.example

**Files:**
- Modify: `src/auth/auth.controller.ts` (adicionar `PASSWORD_RESET_THROTTLE` e aplicar nos 2 endpoints)
- Modify: `src/config/env.validation.ts` (adicionar SMTP vars opcionais)
- Modify: `.env.example` (adicionar secção JWT + secção SMTP)

**Interfaces:**
- Consumes: nada das tasks anteriores
- Produces: `PASSWORD_RESET_THROTTLE` — constante exportada de `auth.controller.ts`

- [ ] **Step 1: Escrever teste para a constante de throttle (RED)**

Criar `src/auth/auth.controller.throttle.spec.ts`:

```typescript
import { PASSWORD_RESET_THROTTLE } from './auth.controller';

describe('PASSWORD_RESET_THROTTLE', () => {
  it('limita a 3 pedidos por hora', () => {
    expect(PASSWORD_RESET_THROTTLE.default.limit).toBe(3);
    expect(PASSWORD_RESET_THROTTLE.default.ttl).toBe(3_600_000);
  });
});
```

- [ ] **Step 2: Verificar que o teste falha (RED)**

```bash
npx jest --testPathPattern=auth.controller.throttle.spec --no-coverage
```

Expected: `SyntaxError` ou `export 'PASSWORD_RESET_THROTTLE' was not found`.

- [ ] **Step 3: Adicionar PASSWORD_RESET_THROTTLE e aplicar em auth.controller.ts**

Em `src/auth/auth.controller.ts`, adicionar logo a seguir às constantes existentes (após a linha `const REFRESH_THROTTLE = ...`):

```typescript
export const PASSWORD_RESET_THROTTLE = { default: { limit: 3, ttl: 3_600_000 } };
```

Substituir o throttle nos dois endpoints de password reset:

```typescript
  // Antes:
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.resetPassword(dto.token, dto.newPassword);
  }

  // Depois:
  @Public()
  @Throttle(PASSWORD_RESET_THROTTLE)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(PASSWORD_RESET_THROTTLE)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.resetPassword(dto.token, dto.newPassword);
  }
```

- [ ] **Step 4: Verificar que o teste passa (GREEN)**

```bash
npx jest --testPathPattern=auth.controller.throttle.spec --no-coverage
```

Expected: `Tests: 1 passed, 1 total`

- [ ] **Step 5: Adicionar SMTP vars ao schema de validação de env**

Em `src/config/env.validation.ts`, adicionar antes da linha `.options({ allowUnknown: true })`:

```typescript
  // SMTP — opcionais (sem SMTP_HOST, emails não são enviados; app arranca na mesma)
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().optional().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional().default('INNOVA <noreply@innova.ao>'),
```

O schema completo fica:

```typescript
import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  PORT: Joi.number().default(4000),

  // Base de dados
  DATABASE_URL: Joi.string().required(),

  // JWT — rejeita o placeholder do .env.example
  JWT_SECRET: Joi.string().min(32).disallow('your_jwt_secret').required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  // Upload e CORS
  ALLOWED_FILE_HOST: Joi.string().required(),
  ALLOWED_ORIGINS: Joi.string().required(),

  // URLs de infra
  APP_URL: Joi.string().uri().required(),
  METRICS_TOKEN: Joi.string().required(),
  STORAGE_BASE_URL: Joi.string().uri().optional(),

  // Swagger — obrigatório apenas em produção
  SWAGGER_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),

  // IA Tutor — opcionais (app funciona sem eles)
  AI_PROVIDER: Joi.string().valid('groq', 'gemini', 'ollama').optional(),
  GROQ_API_KEY: Joi.string().optional().allow(''),
  GROQ_MODEL: Joi.string().optional(),
  GEMINI_API_KEY: Joi.string().optional().allow(''),
  GEMINI_MODEL: Joi.string().optional(),
  OLLAMA_URL: Joi.string().uri().optional().allow(''),
  OLLAMA_MODEL: Joi.string().optional(),

  // Runtime
  JWT_USER_CACHE_TTL_MS: Joi.number().default(30000),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  AUTH_ALLOW_BEARER: Joi.boolean().default(true),

  // SMTP — opcionais (sem SMTP_HOST, emails não são enviados; app arranca na mesma)
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().optional().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional().default('INNOVA <noreply@innova.ao>'),
}).options({ allowUnknown: true });
```

- [ ] **Step 6: Adicionar secções JWT + SMTP ao .env.example**

Localizar a primeira linha de `.env.example` e adicionar este bloco logo no início (ou após `NODE_ENV=development`):

```bash
# ─── Segredos JWT ─────────────────────────────────────────────────────────────
# Gerar com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Mínimo obrigatório: 32 chars. O boot falha se este valor tiver < 32 chars.
JWT_SECRET=
JWT_REFRESH_SECRET=

# ─── SMTP (opcional — emails de convite e reset de password) ──────────────────
# Se SMTP_HOST estiver vazio, emails não são enviados (warning nos logs, app continua a funcionar)
# Compatível com qualquer servidor SMTP: Gmail, Brevo, Mailgun, Postfix, etc.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="INNOVA <noreply@innova.ao>"
```

- [ ] **Step 7: Verificar que a suite passa**

```bash
npx jest --testPathPattern="auth.controller.throttle|mail.service.spec|users.service.spec" --no-coverage
```

Expected: todos os testes passam.

- [ ] **Step 8: Commit**

```bash
git add src/auth/auth.controller.ts src/auth/auth.controller.throttle.spec.ts src/config/env.validation.ts .env.example
git commit -m "feat(security): PASSWORD_RESET_THROTTLE 3/hora, SMTP vars no schema, guia de segredos no .env.example"
```
