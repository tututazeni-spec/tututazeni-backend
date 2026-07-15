# A5-PR1 — Remover Multer e converter work-declaration para URL-string Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o upload binário real do módulo `work-declaration`, criar o validador partilhado `@IsAllowedFileUrl()`, e converter os dois endpoints para o padrão URL-string já usado pelos outros módulos.

**Architecture:** O validador é criado em `src/common/validators/` seguindo o padrão de `strong-password.decorator.ts`. O `MulterModule` é removido do módulo. Os dois endpoints passam a receber `{ fileUrl: string }` via `@Body()` em vez de `multipart/form-data`.

**Tech Stack:** NestJS, class-validator `registerDecorator`, Jest

## Global Constraints

- Nunca usar `name` no modelo User — sempre `fullName`
- Sem alterações ao schema Prisma
- Todos os testes correm com `npx jest <path> --runInBand --forceExit`
- Commits em PowerShell com here-string `@'...'@`
- Branch: criar `fix/a5-pr1-multer-removal` a partir de `main`

---

### Task 1: Criar validador `@IsAllowedFileUrl()` com testes

**Files:**
- Create: `src/common/validators/is-allowed-file-url.validator.ts`
- Create: `src/common/validators/is-allowed-file-url.validator.spec.ts`
- Modify: `.env.example` — adicionar `ALLOWED_FILE_HOST`

**Interfaces:**
- Produces: `IsAllowedFileUrl(options?: ValidationOptions): PropertyDecorator` — decorator class-validator para aplicar a campos `fileUrl: string`

- [ ] **Step 1: Criar branch**

```powershell
git checkout main
git pull
git checkout -b fix/a5-pr1-multer-removal
```

Expected: branch criada a partir de main actualizado.

- [ ] **Step 2: Escrever o teste (RED)**

Criar `src/common/validators/is-allowed-file-url.validator.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { IsAllowedFileUrl } from './is-allowed-file-url.validator';

class Dto {
  @IsAllowedFileUrl()
  fileUrl!: string;
}

async function errorsFor(value: string, allowedHost: string) {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = allowedHost;
  const d = new Dto();
  d.fileUrl = value;
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs;
}

describe('IsAllowedFileUrl', () => {
  it('aceita https com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/logo.png', 'storage.innova.ao')).toHaveLength(0);
  });

  it('aceita vários hosts — segundo da lista', async () => {
    expect(await errorsFor('https://cdn.innova.ao/img.png', 'storage.innova.ao,cdn.innova.ao')).toHaveLength(0);
  });

  it('aceita qualquer https quando ALLOWED_FILE_HOST está vazio', async () => {
    expect(await errorsFor('https://qualquer.com/file.pdf', '')).toHaveLength(0);
  });

  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/logo.png', 'storage.innova.ao')).length).toBeGreaterThan(0);
  });

  it('recusa javascript:', async () => {
    expect((await errorsFor('javascript:alert(1)', 'storage.innova.ao')).length).toBeGreaterThan(0);
  });

  it('recusa data:', async () => {
    expect((await errorsFor('data:text/html,<h1>xss</h1>', 'storage.innova.ao')).length).toBeGreaterThan(0);
  });

  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/logo.png', 'storage.innova.ao')).length).toBeGreaterThan(0);
  });

  it('recusa string vazia', async () => {
    expect((await errorsFor('', 'storage.innova.ao')).length).toBeGreaterThan(0);
  });

  it('recusa URL inválida', async () => {
    expect((await errorsFor('not-a-url', 'storage.innova.ao')).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Correr teste para confirmar RED**

```powershell
npx jest src/common/validators/is-allowed-file-url.validator.spec.ts --runInBand --forceExit
```

Expected: FAIL — `Cannot find module './is-allowed-file-url.validator'`

- [ ] **Step 4: Implementar o validador**

Criar `src/common/validators/is-allowed-file-url.validator.ts`:

```typescript
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export function IsAllowedFileUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllowedFileUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, _args: ValidationArguments): boolean {
          if (typeof value !== 'string' || !value) return false;
          let url: URL;
          try {
            url = new URL(value);
          } catch {
            return false;
          }
          if (url.protocol !== 'https:') return false;
          const raw = process.env.ALLOWED_FILE_HOST ?? '';
          const allowed = raw
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean);
          if (allowed.length === 0) return true;
          return allowed.includes(url.hostname);
        },
        defaultMessage(args: ValidationArguments): string {
          const v = args.value as string;
          let url: URL | null = null;
          try {
            url = new URL(v);
          } catch {
            /* not a url */
          }
          if (!url) return `${args.property} deve ser uma URL válida`;
          if (url.protocol !== 'https:') return `${args.property} deve usar HTTPS`;
          return `${args.property} aponta para um domínio não autorizado`;
        },
      },
    });
  };
}
```

- [ ] **Step 5: Correr testes para confirmar GREEN**

```powershell
npx jest src/common/validators/is-allowed-file-url.validator.spec.ts --runInBand --forceExit
```

Expected: 9 tests passing.

- [ ] **Step 6: Adicionar `ALLOWED_FILE_HOST` ao `.env.example`**

Abrir `.env.example` e adicionar no fim:

```
# Domínios autorizados para fileUrl (separados por vírgula). Deixar vazio = aceitar qualquer https.
ALLOWED_FILE_HOST=storage.innova.ao
```

- [ ] **Step 7: Commit**

```powershell
git add src/common/validators/is-allowed-file-url.validator.ts src/common/validators/is-allowed-file-url.validator.spec.ts .env.example
git commit -m @'
feat(security): validador IsAllowedFileUrl — https + allowlist de domínio (A5-PR1)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

### Task 2: Refactor `work-declaration` — remover Multer e converter endpoints

**Files:**
- Modify: `src/work-declaration/work-declaration.module.ts`
- Modify: `src/work-declaration/work-declaration.dto.ts`
- Modify: `src/work-declaration/work-declaration.controller.ts`
- Modify: `src/work-declaration/work-declaration.controller.spec.ts`

**Interfaces:**
- Consumes: `IsAllowedFileUrl` de `../common/validators/is-allowed-file-url.validator`
- Produces: `UploadLogoDto { fileUrl: string }` — novo DTO exportado

- [ ] **Step 1: Escrever os testes dos endpoints convertidos (RED)**

Adicionar ao fim de `src/work-declaration/work-declaration.controller.spec.ts`:

```typescript
  it('uploadLogo → upsertTenantConfig(tenantId, { logoUrl: dto.fileUrl })', async () => {
    const dto = { fileUrl: 'https://storage.innova.ao/logo.png' };
    await controller.uploadLogo(dto as any, mockUser as any);
    expect(mockSvc.upsertTenantConfig).toHaveBeenCalledWith('tenant-1', { logoUrl: 'https://storage.innova.ao/logo.png' });
  });

  it('signDeclaration → signDeclaration(tenantId, userId, id, dto) sem signatureFile', async () => {
    const dto = { type: 'DIGITAL', signatureUrl: undefined } as any;
    await controller.signDeclaration('uuid-1', dto, mockUser as any);
    expect(mockSvc.signDeclaration).toHaveBeenCalledWith('tenant-1', '1', 'uuid-1', dto);
  });
```

- [ ] **Step 2: Correr testes para confirmar RED**

```powershell
npx jest src/work-declaration/work-declaration.controller.spec.ts --runInBand --forceExit
```

Expected: os dois novos testes falham — `uploadLogo` tem assinatura diferente (ainda recebe `logo: Multer.File`).

- [ ] **Step 3: Substituir `work-declaration.module.ts`**

Substituir o conteúdo completo do ficheiro por:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';
import { WorkDeclarationController } from './work-declaration.controller';
import { WorkDeclarationService } from './work-declaration.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, PdfModule, UsersModule, NotificationsModule],
  controllers: [WorkDeclarationController],
  providers: [WorkDeclarationService],
  exports: [WorkDeclarationService],
})
export class WorkDeclarationModule {}
```

- [ ] **Step 4: Adicionar `UploadLogoDto` a `work-declaration.dto.ts`**

No fim do ficheiro (antes do último `}`  ou após a última export class), adicionar:

```typescript
// ─── UploadLogoDto ────────────────────────────────────────────────────────────

export class UploadLogoDto {
  @ApiProperty({ description: 'URL do logo já carregado para storage externo' })
  @IsAllowedFileUrl()
  fileUrl!: string;
}
```

E no topo do ficheiro, adicionar o import (junto dos outros imports de class-validator):

```typescript
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
```

- [ ] **Step 5: Refactorizar `work-declaration.controller.ts`**

**5a — Remover imports desnecessários.**

Nas linhas 1-17 (imports de `@nestjs/common`), remover `UploadedFile` e `UseInterceptors` da lista:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Response,
} from '@nestjs/common';
```

Remover a linha:
```typescript
import { FileInterceptor } from '@nestjs/platform-express';
```

Nos imports do swagger, remover `ApiConsumes` se não for usado noutro sítio (verificar com `grep ApiConsumes src/work-declaration/work-declaration.controller.ts`).

**5b — Actualizar imports dos DTOs** para incluir `UploadLogoDto`:

```typescript
import {
  // ... DTOs já existentes ...
  UploadLogoDto,
} from './work-declaration.dto';
```

**5c — Substituir `POST /:id/sign`** (remover `@UseInterceptors`, `@ApiConsumes`, `@UploadedFile()`):

```typescript
  @Post(':id/sign')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Sign a declaration (upload signature image or apply digital sig)' })
  async signDeclaration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignDeclarationDto,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.signDeclaration(
      (user as any).tenantId,
      String(user.id),
      id,
      dto,
    );
  }
```

**5d — Substituir `POST /branding/logo`**:

```typescript
  @Post('branding/logo')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set company logo URL used in declaration header' })
  async uploadLogo(@Body() dto: UploadLogoDto, @CurrentUser() user: IAuthUser) {
    return this.workDeclarationService.upsertTenantConfig((user as any).tenantId, {
      logoUrl: dto.fileUrl,
    } as any);
  }
```

- [ ] **Step 6: Correr testes para confirmar GREEN**

```powershell
npx jest src/work-declaration/work-declaration.controller.spec.ts --runInBand --forceExit
```

Expected: todos os testes passam (incluindo os dois novos).

- [ ] **Step 7: Correr suite completa do módulo**

```powershell
npx jest src/work-declaration/ --runInBand --forceExit
```

Expected: todos os testes do módulo passam.

- [ ] **Step 8: Commit**

```powershell
git add src/work-declaration/work-declaration.module.ts src/work-declaration/work-declaration.dto.ts src/work-declaration/work-declaration.controller.ts src/work-declaration/work-declaration.controller.spec.ts
git commit -m @'
fix(security): remover Multer e converter endpoints de logo/assinatura para URL-string (A5-PR1)

- Remove MulterModule do work-declaration.module
- POST /branding/logo passa a aceitar { fileUrl } em vez de multipart
- POST /:id/sign remove @UseInterceptors e signatureFile fantasma
- Adiciona UploadLogoDto com @IsAllowedFileUrl()

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

### Task 3: Push e PR

- [ ] **Step 1: Push**

```powershell
git push -u origin fix/a5-pr1-multer-removal
```

- [ ] **Step 2: Criar PR**

```powershell
gh pr create --title "fix(security): remover Multer e validador IsAllowedFileUrl — A5-PR1" --body @'
## Summary

- Cria `@IsAllowedFileUrl()` — valida https + allowlist de domínio via `ALLOWED_FILE_HOST`
- Remove `MulterModule` de `work-declaration`
- Converte `POST /branding/logo` e `POST /:id/sign` para `Content-Type: application/json`
- Elimina `logo?.originalname` (🔴 A5-1) e `signatureFile` fantasma (🟠 A5-2)

## Test plan

- [ ] `npx jest src/common/validators/is-allowed-file-url.validator.spec.ts` — 9 testes passam
- [ ] `npx jest src/work-declaration/work-declaration.controller.spec.ts` — todos passam
- [ ] Verificar que `ALLOWED_FILE_HOST` está em `.env.example`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```
