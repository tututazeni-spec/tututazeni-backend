# Spec: Faixa A-Auth — Hardening de Autenticação

**Data:** 2026-07-24
**Área:** Segurança / Autenticação
**Faixa de auditoria:** A-2, A-2-2, A-2-3, A-6-1
**Estado:** Aprovado — pronto para implementação

---

## Contexto

A auditoria de Faixa A identificou quatro lacunas na camada de autenticação do INNOVA:

| ID | Severidade | Achado |
|---|---|---|
| A-2-1 | 🟠 Alto | JWT_SECRET de dev tem 14 chars — processo de geração de segredos fortes para produção não documentado |
| A-2-2 | 🟡 Médio | Temp password usa `Math.random()` (não é CSPRNG) + sem mecanismo de entrega ao utilizador |
| A-2-3 | 🟢 Baixo | Throttle de `forgot-password`/`reset-password` demasiado permissivo (5 req/60s) |
| A-6-1 | 🟠 Alto | `.env.example` sem guia de geração de segredos fortes nem vars SMTP da app |

O `MailService` (`src/mail/mail.service.ts`) já existe como stub com a arquitectura correcta. `nodemailer` não está nas dependências — será adicionado.

---

## Objectivo

Fechar as 4 lacunas com edições cirúrgicas em 6 ficheiros. Sem refactoring de arquitectura — a interface do `MailService` mantém-se, o stub é substituído por implementação real.

---

## Decisões de design

### SMTP genérico via nodemailer

- Provider-agnóstico: funciona com qualquer servidor SMTP (Gmail, Brevo, Mailgun, self-hosted)
- Configurado via env vars `SMTP_*` — todas opcionais no schema Joi
- **Degradação graciosa:** se `SMTP_HOST` não estiver definido, o `MailService` arranca sem transporter e regista `logger.warn` em cada tentativa de envio — o sistema funciona sem email, o admin é avisado nos logs
- **Se SMTP configurado e envio falha:** o método lança excepção — o caller (users.service) decide se aborta ou não. Para criação de utilizadores: SMTP configurado + falha de envio = 500, user não criado (evita contas zombie sem password entregue)

### Fluxo de criação de utilizador (novo)

```
Admin POST /users
  → gerar tempPassword = crypto.randomBytes(12).toString('hex')  // 24 hex chars
  → se SMTP configurado: await mail.sendUserInvite(email, fullName, tempPassword)
      → falha de SMTP: lança excepção → user NÃO é criado (atómico)
  → se SMTP não configurado: logger.warn, continua
  → hash(tempPassword) → prisma.user.create → retornar user
  // tempPassword nunca aparece no response nem nos logs
```

### Email de convite — texto simples

Sem template engine. Conteúdo inline no `MailService`:

```
Assunto: Bem-vindo ao INNOVA — acesso à sua conta

Olá [fullName],

A sua conta foi criada no sistema INNOVA.
Email: [email]
Password temporária: [tempPassword]

Por favor aceda e altere a sua password no primeiro login.

-- Sistema INNOVA
```

### Throttle de password reset

Constante dedicada `PASSWORD_RESET_THROTTLE` = 3 req/hora (vs throttle genérico de auth = 5 req/60s). Aplicada explicitamente nos dois endpoints: `forgot-password` e `reset-password`.

---

## Ficheiros modificados

### 1. `src/mail/mail.service.ts` — **substituição completa**

**Antes:** stub que regista "token gerado, entrega pendente de SMTP"

**Depois:** implementação nodemailer com:
- `onModuleInit()` — cria transporter se `SMTP_HOST` definido; `logger.warn` se ausente
- `sendPasswordReset(email: string, token: string): Promise<void>` — mantém assinatura existente; passa a enviar de verdade
- `sendUserInvite(email: string, fullName: string, tempPassword: string): Promise<void>` — método novo para convites de admin
- `private send(options: Mail.Options): Promise<void>` — helper interno; envia ou `logger.warn` se sem transporter

**Dependência nova:** `nodemailer` + `@types/nodemailer` (dev)

### 2. `src/mail/mail.module.ts` — edição mínima

Adicionar `ConfigModule` aos imports se ainda não estiver (o `onModuleInit` lê directamente de `process.env` — sem injeção necessária, consistente com o padrão do projecto).

### 3. `src/users/users.service.ts` — edição cirúrgica

No método que cria utilizadores com password temporária (actualmente `inviteUser` ou equivalente):

**Antes:**
```typescript
const tempPassword = Math.random().toString(36).slice(-10);
const user = await this.create({ ...dto, password: tempPassword, ... });
```

**Depois:**
```typescript
const tempPassword = crypto.randomBytes(12).toString('hex'); // 24 hex chars, CSPRNG
await this.mail.sendUserInvite(dto.email, dto.fullName, tempPassword); // lança se SMTP falhar
const user = await this.create({ ...dto, password: tempPassword, accountStatus: AccountStatus.PENDING });
```

**Import a adicionar:** `import * as crypto from 'crypto';`

**Nota:** `this.create()` já faz `bcrypt.hash(password)` internamente — o plaintext nunca toca a BD.

### 4. `src/common/config/throttler.config.ts` — adição

```typescript
export const PASSWORD_RESET_THROTTLE = {
  default: { limit: 3, ttl: 3_600_000 }, // 3 req/hora
};
```

### 5. `src/auth/auth.controller.ts` — edição cirúrgica

Substituir o throttle genérico de auth nos dois endpoints:

```typescript
// forgot-password
@Throttle(PASSWORD_RESET_THROTTLE)
@Post('forgot-password')

// reset-password
@Throttle(PASSWORD_RESET_THROTTLE)
@Post('reset-password')
```

Import: `import { PASSWORD_RESET_THROTTLE } from '../common/config/throttler.config';`

### 6. `src/config/env.validation.ts` — adição

```typescript
// Vars SMTP — opcionais (sem SMTP_HOST, emails não são enviados)
SMTP_HOST: Joi.string().optional(),
SMTP_PORT: Joi.number().port().optional().default(587),
SMTP_USER: Joi.string().optional(),
SMTP_PASS: Joi.string().optional(),
SMTP_FROM: Joi.string().optional().default('INNOVA <noreply@innova.ao>'),
```

### 7. `.env.example` — adição de duas secções

```bash
# ─── Segredos JWT ─────────────────────────────────────────────────────────────
# Gerar com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Mínimo obrigatório: 32 chars
JWT_SECRET=
JWT_REFRESH_SECRET=

# ─── SMTP (opcional — emails de convite e reset de password) ──────────────────
# Se SMTP_HOST estiver vazio, emails não são enviados (warning nos logs)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="INNOVA <noreply@innova.ao>"
```

---

## Fora de âmbito

- Templates HTML para emails (YAGNI — texto simples é suficiente)
- "Reenviar convite" endpoint (YAGNI — admin pode recriar o utilizador)
- Autenticação OAuth / SSO
- Email de boas-vindas para utilizadores criados por outros fluxos (apenas o fluxo de convite admin é alterado)

---

## Testes

### Unitários (mail.service.spec.ts)
- `sendUserInvite` com transporter mockado → verifica chamada com `to`, `subject`, `text` correctos
- `sendUserInvite` sem transporter (SMTP não configurado) → retorna sem erro, `logger.warn` chamado
- `sendUserInvite` com transporter que rejeita → lança excepção

### Integração (users.service.spec.ts / existente)
- Criação com SMTP configurado: mock `mail.sendUserInvite` → user criado → password hashada (não é o plaintext)
- Criação com SMTP falha: mock `mail.sendUserInvite` rejeita → user NÃO criado
- Criação sem SMTP: `sendUserInvite` retorna silenciosamente → user criado

### Throttle (auth.controller.spec.ts / e2e)
- 4 req/hora a `forgot-password` → 4ª retorna 429
- 4 req/hora a `reset-password` → 4ª retorna 429
