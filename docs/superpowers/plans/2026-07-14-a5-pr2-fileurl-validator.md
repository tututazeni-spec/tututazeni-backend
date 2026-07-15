# A5-PR2 — Aplicar `@IsAllowedFileUrl()` a todos os DTOs com fileUrl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir `@IsString()` / `@IsUrl()` por `@IsAllowedFileUrl()` em todos os DTOs que aceitam `fileUrl` como URL de ficheiro externo, em 6 módulos distintos.

**Architecture:** Alteração puramente aditiva de decorators — sem mudanças de lógica de negócio nem de schema. O validador `IsAllowedFileUrl` já existe após A5-PR1. Este PR apenas aplica-o. Cada módulo tem o seu próprio commit para facilitar revisão e rollback.

**Tech Stack:** NestJS, class-validator, Jest

## Global Constraints

- Depende de A5-PR1 estar merged em `main` antes de iniciar
- `@IsAllowedFileUrl()` importado de `../../common/validators/is-allowed-file-url.validator` (ajustar path relativo por módulo)
- Campos `@IsOptional()` mantêm o decorator — acrescentar `@IsAllowedFileUrl()` ao lado
- Sem alterações ao schema Prisma, controllers, ou lógica de serviço
- Todos os testes correm com `npx jest <path> --runInBand --forceExit`
- Branch: `fix/a5-pr2-fileurl-validator` a partir de `main` (após PR1 merged)

---

### Task 1: `onboarding` — `UploadDocumentDto.fileUrl`

**Files:**
- Modify: `src/onboarding/onboarding.dto.ts`
- Modify: `src/onboarding/onboarding.controller.spec.ts` (se existir) ou criar `src/onboarding/onboarding.dto.spec.ts`

**Interfaces:**
- Consumes: `IsAllowedFileUrl` de `../common/validators/is-allowed-file-url.validator`

- [ ] **Step 1: Criar branch**

```powershell
git checkout main
git pull
git checkout -b fix/a5-pr2-fileurl-validator
```

- [ ] **Step 2: Escrever teste (RED)**

Criar `src/onboarding/onboarding.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { UploadDocumentDto } from './onboarding.dto';

async function errorsFor(fileUrl: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new UploadDocumentDto(), {
    userId: 1,
    stepId: 1,
    documentType: 'ID',
    fileUrl,
  });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('UploadDocumentDto.fileUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/doc.pdf')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/doc.pdf')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/doc.pdf')).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Correr teste para confirmar RED**

```powershell
npx jest src/onboarding/onboarding.dto.spec.ts --runInBand --forceExit
```

Expected: FAIL — `fileUrl` aceita URLs http ou de hosts não autorizados.

- [ ] **Step 4: Aplicar `@IsAllowedFileUrl()` em `onboarding.dto.ts`**

Em `src/onboarding/onboarding.dto.ts`, na classe `UploadDocumentDto`:

Adicionar import no topo do ficheiro:
```typescript
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
```

Substituir o decorator `@IsString()` do campo `fileUrl`:
```typescript
  @ApiProperty()
  @IsAllowedFileUrl()
  fileUrl!: string;
```

- [ ] **Step 5: Correr teste para confirmar GREEN**

```powershell
npx jest src/onboarding/onboarding.dto.spec.ts --runInBand --forceExit
```

Expected: 3 testes passam.

- [ ] **Step 6: Commit**

```powershell
git add src/onboarding/onboarding.dto.ts src/onboarding/onboarding.dto.spec.ts
git commit -m @'
fix(security): aplicar IsAllowedFileUrl a UploadDocumentDto.fileUrl — A5-PR2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

### Task 2: `library` — `CreateLibraryItemDto.fileUrl`

**Files:**
- Modify: `src/library/dto/create-item.dto.ts`
- Create: `src/library/dto/create-item.dto.spec.ts`

**Interfaces:**
- Consumes: `IsAllowedFileUrl` de `../../common/validators/is-allowed-file-url.validator`

- [ ] **Step 1: Escrever teste (RED)**

Criar `src/library/dto/create-item.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { CreateLibraryItemDto } from './create-item.dto';

async function errorsFor(fileUrl: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new CreateLibraryItemDto(), {
    title: 'Manual',
    type: 'DOCUMENT',
    fileUrl,
  });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('CreateLibraryItemDto.fileUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/manual.pdf')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/manual.pdf')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/manual.pdf')).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr teste para confirmar RED**

```powershell
npx jest src/library/dto/create-item.dto.spec.ts --runInBand --forceExit
```

Expected: FAIL.

- [ ] **Step 3: Aplicar `@IsAllowedFileUrl()` em `create-item.dto.ts`**

Adicionar import:
```typescript
import { IsAllowedFileUrl } from '../../common/validators/is-allowed-file-url.validator';
```

Substituir no campo `fileUrl`:
```typescript
  @ApiProperty({ example: 'https://storage.innova.ao/docs/manual.pdf' })
  @IsAllowedFileUrl()
  fileUrl: string;
```

- [ ] **Step 4: Correr teste para confirmar GREEN**

```powershell
npx jest src/library/dto/create-item.dto.spec.ts --runInBand --forceExit
```

Expected: 3 testes passam.

- [ ] **Step 5: Commit**

```powershell
git add src/library/dto/create-item.dto.ts src/library/dto/create-item.dto.spec.ts
git commit -m @'
fix(security): aplicar IsAllowedFileUrl a CreateLibraryItemDto.fileUrl — A5-PR2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

### Task 3: `document-repository` — `CreateDocumentDto.fileUrl` e `NewVersionDto.fileUrl`

**Files:**
- Modify: `src/document-repository/document-repository.dto.ts`
- Create: `src/document-repository/document-repository.dto.spec.ts`

**Interfaces:**
- Consumes: `IsAllowedFileUrl` de `../common/validators/is-allowed-file-url.validator`

- [ ] **Step 1: Escrever testes (RED)**

Criar `src/document-repository/document-repository.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { CreateDocumentDto, NewVersionDto } from './document-repository.dto';

async function errorsFor<T extends object>(instance: T, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const errs = await validate(instance);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('CreateDocumentDto.fileUrl — IsAllowedFileUrl', () => {
  const base = () =>
    Object.assign(new CreateDocumentDto(), {
      title: 'Doc',
      sensitivity: 'PUBLIC',
      mimeType: 'application/pdf',
    });

  it('aceita URL válida', async () => {
    expect(await errorsFor(Object.assign(base(), { fileUrl: 'https://storage.innova.ao/d.pdf' }))).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor(Object.assign(base(), { fileUrl: 'http://storage.innova.ao/d.pdf' }))).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor(Object.assign(base(), { fileUrl: 'https://evil.com/d.pdf' }))).length).toBeGreaterThan(0);
  });
});

describe('NewVersionDto.fileUrl — IsAllowedFileUrl', () => {
  const base = () =>
    Object.assign(new NewVersionDto(), { mimeType: 'application/pdf' });

  it('aceita URL válida', async () => {
    expect(await errorsFor(Object.assign(base(), { fileUrl: 'https://storage.innova.ao/v2.pdf' }))).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor(Object.assign(base(), { fileUrl: 'http://evil.com/v2.pdf' }))).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr testes para confirmar RED**

```powershell
npx jest src/document-repository/document-repository.dto.spec.ts --runInBand --forceExit
```

Expected: FAIL.

- [ ] **Step 3: Aplicar `@IsAllowedFileUrl()` em `document-repository.dto.ts`**

Adicionar import:
```typescript
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
```

Em `CreateDocumentDto`, substituir:
```typescript
  @ApiProperty() @IsAllowedFileUrl() fileUrl!: string; // URL no storage (S3/Azure)
```

Em `NewVersionDto`, substituir:
```typescript
  @ApiProperty() @IsAllowedFileUrl() fileUrl!: string;
```

- [ ] **Step 4: Correr testes para confirmar GREEN**

```powershell
npx jest src/document-repository/document-repository.dto.spec.ts --runInBand --forceExit
```

Expected: 5 testes passam.

- [ ] **Step 5: Commit**

```powershell
git add src/document-repository/document-repository.dto.ts src/document-repository/document-repository.dto.spec.ts
git commit -m @'
fix(security): aplicar IsAllowedFileUrl a CreateDocumentDto e NewVersionDto.fileUrl — A5-PR2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

### Task 4: `employees` — `EmployeesCreateDocumentDto.fileUrl`

**Files:**
- Modify: `src/employees/employees.dto.ts`
- Create: `src/employees/employees.dto.fileurl.spec.ts`

**Interfaces:**
- Consumes: `IsAllowedFileUrl` de `../common/validators/is-allowed-file-url.validator`

- [ ] **Step 1: Escrever teste (RED)**

Criar `src/employees/employees.dto.fileurl.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { EmployeesCreateDocumentDto } from './employees.dto';

async function errorsFor(fileUrl: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new EmployeesCreateDocumentDto(), {
    employeeId: 1,
    name: 'BI',
    type: 'IDENTITY',
    fileUrl,
  });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('EmployeesCreateDocumentDto.fileUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida', async () => {
    expect(await errorsFor('https://storage.innova.ao/bi.jpg')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/bi.jpg')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/bi.jpg')).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr teste para confirmar RED**

```powershell
npx jest src/employees/employees.dto.fileurl.spec.ts --runInBand --forceExit
```

Expected: FAIL.

- [ ] **Step 3: Aplicar `@IsAllowedFileUrl()` em `employees.dto.ts`**

Adicionar import (junto dos outros imports de validators):
```typescript
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
```

Em `EmployeesCreateDocumentDto`, substituir:
```typescript
  @ApiProperty() @IsAllowedFileUrl() fileUrl!: string;
```

- [ ] **Step 4: Correr teste para confirmar GREEN**

```powershell
npx jest src/employees/employees.dto.fileurl.spec.ts --runInBand --forceExit
```

Expected: 3 testes passam.

- [ ] **Step 5: Commit**

```powershell
git add src/employees/employees.dto.ts src/employees/employees.dto.fileurl.spec.ts
git commit -m @'
fix(security): aplicar IsAllowedFileUrl a EmployeesCreateDocumentDto.fileUrl — A5-PR2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

### Task 5: `assessments` — `AssessmentsAnswerDto.fileUrl` (opcional)

**Files:**
- Modify: `src/assessments/assessments.dto.ts`
- Create: `src/assessments/assessments.dto.fileurl.spec.ts`

**Interfaces:**
- Consumes: `IsAllowedFileUrl` de `../common/validators/is-allowed-file-url.validator`

- [ ] **Step 1: Escrever teste (RED)**

Criar `src/assessments/assessments.dto.fileurl.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { AssessmentsAnswerDto } from './assessments.dto';

async function errorsFor(fileUrl: string | undefined, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new AssessmentsAnswerDto(), { questionId: 1, fileUrl });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('AssessmentsAnswerDto.fileUrl — IsAllowedFileUrl (opcional)', () => {
  it('aceita ausência de fileUrl (campo opcional)', async () => {
    expect(await errorsFor(undefined)).toHaveLength(0);
  });
  it('aceita URL válida quando presente', async () => {
    expect(await errorsFor('https://storage.innova.ao/resposta.jpg')).toHaveLength(0);
  });
  it('recusa http quando presente', async () => {
    expect((await errorsFor('http://storage.innova.ao/r.jpg')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado quando presente', async () => {
    expect((await errorsFor('https://evil.com/r.jpg')).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr testes para confirmar RED**

```powershell
npx jest src/assessments/assessments.dto.fileurl.spec.ts --runInBand --forceExit
```

Expected: FAIL nos testes de http e host não autorizado.

- [ ] **Step 3: Aplicar `@IsAllowedFileUrl()` em `assessments.dto.ts`**

Adicionar import:
```typescript
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
```

Em `AssessmentsAnswerDto`, substituir o campo `fileUrl` (manter `@IsOptional()`):
```typescript
  @ApiPropertyOptional({ description: 'URL do ficheiro (FILE_UPLOAD)' })
  @IsOptional()
  @IsAllowedFileUrl()
  fileUrl?: string;
```

- [ ] **Step 4: Correr testes para confirmar GREEN**

```powershell
npx jest src/assessments/assessments.dto.fileurl.spec.ts --runInBand --forceExit
```

Expected: 4 testes passam.

- [ ] **Step 5: Commit**

```powershell
git add src/assessments/assessments.dto.ts src/assessments/assessments.dto.fileurl.spec.ts
git commit -m @'
fix(security): aplicar IsAllowedFileUrl a AssessmentsAnswerDto.fileUrl — A5-PR2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

### Task 6: `avatar-training` — `UploadKnowledgeDto.fileUrl`

**Files:**
- Modify: `src/avatar-training/avatar-training.dto.ts`
- Create: `src/avatar-training/avatar-training.dto.fileurl.spec.ts`

**Interfaces:**
- Consumes: `IsAllowedFileUrl` de `../common/validators/is-allowed-file-url.validator`

- [ ] **Step 1: Escrever teste (RED)**

Criar `src/avatar-training/avatar-training.dto.fileurl.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { UploadKnowledgeDto } from './avatar-training.dto';

async function errorsFor(fileUrl: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new UploadKnowledgeDto(), { fileUrl, title: 'Manual' });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('UploadKnowledgeDto.fileUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/knowledge.pdf')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/k.pdf')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/k.pdf')).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr testes para confirmar RED**

```powershell
npx jest src/avatar-training/avatar-training.dto.fileurl.spec.ts --runInBand --forceExit
```

Expected: FAIL — `@IsUrl()` existente não restringe por domínio nem força https.

- [ ] **Step 3: Aplicar `@IsAllowedFileUrl()` em `avatar-training.dto.ts`**

Adicionar import:
```typescript
import { IsAllowedFileUrl } from '../common/validators/is-allowed-file-url.validator';
```

Em `UploadKnowledgeDto`, substituir `@IsUrl()` por:
```typescript
export class UploadKnowledgeDto {
  @IsAllowedFileUrl()
  fileUrl!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;
}
```

- [ ] **Step 4: Correr testes para confirmar GREEN**

```powershell
npx jest src/avatar-training/avatar-training.dto.fileurl.spec.ts --runInBand --forceExit
```

Expected: 3 testes passam.

- [ ] **Step 5: Correr suite global para regressões**

```powershell
npx jest --runInBand --forceExit --passWithNoTests 2>&1 | Select-Object -Last 20
```

Expected: sem falhas novas.

- [ ] **Step 6: Commit**

```powershell
git add src/avatar-training/avatar-training.dto.ts src/avatar-training/avatar-training.dto.fileurl.spec.ts
git commit -m @'
fix(security): aplicar IsAllowedFileUrl a UploadKnowledgeDto.fileUrl — A5-PR2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
'@
```

---

### Task 7: Push e PR

- [ ] **Step 1: Push**

```powershell
git push -u origin fix/a5-pr2-fileurl-validator
```

- [ ] **Step 2: Criar PR**

```powershell
gh pr create --title "fix(security): aplicar IsAllowedFileUrl a todos os DTOs com fileUrl — A5-PR2" --body @'
## Summary

- Aplica `@IsAllowedFileUrl()` (criado em A5-PR1) a todos os DTOs com `fileUrl` em 6 módulos
- Garante https + allowlist de domínio (`ALLOWED_FILE_HOST`) em onboarding, library, document-repository, employees, assessments e avatar-training
- Resolve 🟠 A5-4 — SSRF/URL injection via fileUrl não validado

## Test plan

- [ ] `npx jest src/onboarding/onboarding.dto.spec.ts` — 3 passam
- [ ] `npx jest src/library/dto/create-item.dto.spec.ts` — 3 passam
- [ ] `npx jest src/document-repository/document-repository.dto.spec.ts` — 5 passam
- [ ] `npx jest src/employees/employees.dto.fileurl.spec.ts` — 3 passam
- [ ] `npx jest src/assessments/assessments.dto.fileurl.spec.ts` — 4 passam
- [ ] `npx jest src/avatar-training/avatar-training.dto.fileurl.spec.ts` — 3 passam

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```
