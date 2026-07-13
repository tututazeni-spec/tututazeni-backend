# A4-PR3 — Substituir inline @Body interfaces por DTOs com class-validator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar os 18 endpoints que usam `@Body()` com plain TypeScript interfaces (apagadas em runtime), substituindo por classes com decoradores `class-validator` para que o `ValidationPipe` global aplique validação real.

**Architecture:** Cada novo DTO é adicionado ao ficheiro `.dto.ts` existente do módulo (Abordagem C — co-localização). Os testes são criados em ficheiros `.dto.spec.ts` novos por módulo. O controller actualiza o tipo do parâmetro `@Body()`. Excepção: `work-declaration` — `UpsertTenantConfigDto` já existe; só o controller muda.

**Tech Stack:** NestJS, class-validator, class-transformer, Jest

## Global Constraints

- Nunca apagar ou renomear DTOs existentes — apenas adicionar novos ao final do ficheiro `.dto.ts`
- Imports de `class-validator` são acrescentados à lista existente do ficheiro — não duplicar importações
- Cada DTO usa `!` (definite assignment) nos campos obrigatórios, `?` nos opcionais — consistente com o projecto
- Comando de teste: `npx jest --testPathPattern=<pattern> --no-coverage`
- Verificação de tipos: `npx tsc --noEmit --project tsconfig.build.json`
- Padrão de teste de DTO: `plainToInstance` + `validate` da `class-validator`

---

### Task 1: ReadBulkDto em notifications.dto.ts (caso mais crítico — acesso a todos os utilizadores)

**Files:**
- Create: `src/notifications/notifications.dto.spec.ts`
- Modify: `src/notifications/notifications.dto.ts` (adicionar imports + classe no final)
- Modify: `src/notifications/notifications.controller.ts:70`

**Interfaces:**
- Consumes: `notifications.dto.ts` — importar `ReadBulkDto`
- Produces: `ReadBulkDto` com campo `ids: number[]` validado por `@IsArray @ArrayMaxSize(100) @IsInt({each}) @Min(1,{each})`

- [ ] **Step 1: Criar o ficheiro de teste (RED)**

Criar `src/notifications/notifications.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReadBulkDto } from './notifications.dto';

describe('ReadBulkDto', () => {
  it('ids válidos passam', async () => {
    const errors = await validate(plainToInstance(ReadBulkDto, { ids: [1, 2, 3] }));
    expect(errors).toHaveLength(0);
  });

  it('ids em falta falha', async () => {
    const errors = await validate(plainToInstance(ReadBulkDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('array com 101 elementos falha (ArrayMaxSize 100)', async () => {
    const errors = await validate(
      plainToInstance(ReadBulkDto, { ids: Array.from({ length: 101 }, (_, i) => i + 1) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('string dentro do array falha (IsInt each)', async () => {
    const errors = await validate(plainToInstance(ReadBulkDto, { ids: ['abc'] }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('id 0 falha (Min 1 each)', async () => {
    const errors = await validate(plainToInstance(ReadBulkDto, { ids: [0] }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=notifications.dto.spec --no-coverage
```

Expected: FAIL — `ReadBulkDto` não existe ainda.

- [ ] **Step 3: Adicionar imports em falta e ReadBulkDto a notifications.dto.ts**

Na linha 1 do import de `class-validator`, acrescentar `IsNotEmpty, ArrayMaxSize`:

```typescript
import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  IsDateString,
  IsObject,
  MaxLength,
  Min,
  IsIn,
  IsNotEmpty,
  ArrayMaxSize,
} from 'class-validator';
```

No **final** de `src/notifications/notifications.dto.ts`, adicionar:

```typescript
// ─── ReadBulkDto ─────────────────────────────────────────────────────────────

export class ReadBulkDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];
}
```

- [ ] **Step 4: Actualizar o controller**

Em `src/notifications/notifications.controller.ts`, na linha do import dos DTOs, adicionar `ReadBulkDto`. Substituir na linha 70:

```typescript
// Antes
readBulk(@CurrentUser() user: CurrentUserData, @Body() body: { ids: number[] }) {
  return this.svc.markBulkAsRead(user.id, body.ids);
}

// Depois
readBulk(@CurrentUser() user: CurrentUserData, @Body() dto: ReadBulkDto) {
  return this.svc.markBulkAsRead(user.id, dto.ids);
}
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=notifications.dto.spec --no-coverage
```

Expected: `PASS src/notifications/notifications.dto.spec.ts` — 5 testes a verde.

- [ ] **Step 6: Verificar tipos**

```powershell
npx tsc --noEmit --project tsconfig.build.json 2>&1 | Select-String "notifications"
```

Expected: sem erros.

- [ ] **Step 7: Commit**

```powershell
git add src/notifications/notifications.dto.ts src/notifications/notifications.dto.spec.ts src/notifications/notifications.controller.ts
git commit -m "fix(security): validar ReadBulkDto com ArrayMaxSize(100) — A4-PR3"
```

---

### Task 2: SendAllNotificationDto + CreateAutomationRuleBodyDto em notifications.dto.ts

**Files:**
- Modify: `src/notifications/notifications.dto.spec.ts` (adicionar describes)
- Modify: `src/notifications/notifications.dto.ts` (adicionar 2 classes no final)
- Modify: `src/notifications/notifications.controller.ts:157, 189`

**Interfaces:**
- Consumes: `notifications.dto.ts` já modificado na Task 1
- Produces: `SendAllNotificationDto`, `CreateAutomationRuleBodyDto`

- [ ] **Step 1: Adicionar testes (RED)**

Adicionar ao final de `src/notifications/notifications.dto.spec.ts`:

```typescript
import { SendAllNotificationDto, CreateAutomationRuleBodyDto } from './notifications.dto';

describe('SendAllNotificationDto', () => {
  it('campos válidos passam', async () => {
    const errors = await validate(
      plainToInstance(SendAllNotificationDto, { type: 'INFO', message: 'Olá' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('message em falta falha', async () => {
    const errors = await validate(plainToInstance(SendAllNotificationDto, { type: 'INFO' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('message acima de 2000 chars falha', async () => {
    const errors = await validate(
      plainToInstance(SendAllNotificationDto, { type: 'INFO', message: 'a'.repeat(2001) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('CreateAutomationRuleBodyDto', () => {
  it('campos válidos passam', async () => {
    const errors = await validate(
      plainToInstance(CreateAutomationRuleBodyDto, {
        name: 'Regra',
        trigger: 'LOGIN',
        action: 'NOTIFY',
        condition: 'always',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('name em falta falha', async () => {
    const errors = await validate(
      plainToInstance(CreateAutomationRuleBodyDto, {
        trigger: 'LOGIN',
        action: 'NOTIFY',
        condition: 'always',
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=notifications.dto.spec --no-coverage
```

Expected: FAIL — classes não existem ainda.

- [ ] **Step 3: Adicionar DTOs a notifications.dto.ts**

No final do ficheiro, a seguir a `ReadBulkDto`:

```typescript
// ─── SendAllNotificationDto ───────────────────────────────────────────────────

export class SendAllNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

// ─── CreateAutomationRuleBodyDto ──────────────────────────────────────────────

export class CreateAutomationRuleBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trigger!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  action!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  condition!: string;
}
```

- [ ] **Step 4: Actualizar controller (linhas 157 e 189)**

Adicionar `SendAllNotificationDto, CreateAutomationRuleBodyDto` ao import dos DTOs no controller.

```typescript
// Linha 157 — antes
sendAll(@Body() body: { type: string; message: string; title?: string }) {
  return this.svc.sendToAll(body.type, body.message, body.title);
}

// Linha 157 — depois
sendAll(@Body() dto: SendAllNotificationDto) {
  return this.svc.sendToAll(dto.type, dto.message, dto.title);
}

// Linha 189 — antes
createRule(@Body() body: { name: string; trigger: string; action: string; condition: string }) {
  return this.svc.createAutomationRule(body);
}

// Linha 189 — depois
createRule(@Body() dto: CreateAutomationRuleBodyDto) {
  return this.svc.createAutomationRule(dto);
}
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=notifications.dto.spec --no-coverage
```

Expected: PASS — todos os testes a verde.

- [ ] **Step 6: Commit**

```powershell
git add src/notifications/notifications.dto.ts src/notifications/notifications.dto.spec.ts src/notifications/notifications.controller.ts
git commit -m "fix(security): validar SendAllNotificationDto e CreateAutomationRuleBodyDto — A4-PR3"
```

---

### Task 3: UpdateContractStatusDto + UpdateCareerPlanStatusDto em employees.dto.ts

**Files:**
- Create: `src/employees/employees.dto.spec.ts`
- Modify: `src/employees/employees.dto.ts` (adicionar imports + 2 classes no final)
- Modify: `src/employees/employees.controller.ts:147, 215`

**Interfaces:**
- Consumes: `EmployeeStatus` enum já definido em `employees.dto.ts`
- Produces: `UpdateContractStatusDto`, `UpdateCareerPlanStatusDto`

- [ ] **Step 1: Criar ficheiro de teste (RED)**

Criar `src/employees/employees.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  UpdateContractStatusDto,
  UpdateCareerPlanStatusDto,
  EmployeeStatus,
} from './employees.dto';

describe('UpdateContractStatusDto', () => {
  it('ACTIVE passa', async () => {
    const errors = await validate(
      plainToInstance(UpdateContractStatusDto, { status: 'ACTIVE' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('TERMINATED passa', async () => {
    const errors = await validate(
      plainToInstance(UpdateContractStatusDto, { status: 'TERMINATED' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('valor inválido falha', async () => {
    const errors = await validate(
      plainToInstance(UpdateContractStatusDto, { status: 'INVALID_STATUS' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('status em falta falha', async () => {
    const errors = await validate(plainToInstance(UpdateContractStatusDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateCareerPlanStatusDto', () => {
  it('ACTIVE passa', async () => {
    const errors = await validate(
      plainToInstance(UpdateCareerPlanStatusDto, { status: 'ACTIVE' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('COMPLETED passa', async () => {
    const errors = await validate(
      plainToInstance(UpdateCareerPlanStatusDto, { status: 'COMPLETED' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('valor fora da lista falha', async () => {
    const errors = await validate(
      plainToInstance(UpdateCareerPlanStatusDto, { status: 'BOGUS' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=employees.dto.spec --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Adicionar imports e DTOs a employees.dto.ts**

Acrescentar `IsNotEmpty, IsIn, MaxLength, ArrayMaxSize` à linha de imports de `class-validator`:

```typescript
import {
  IsString,
  IsInt,
  IsOptional,
  IsDateString,
  IsNumber,
  IsEmail,
  IsEnum,
  IsArray,
  IsBoolean,
  IsObject,
  ValidateNested,
  Min,
  Max,
  IsUrl,
  IsNotEmpty,
  IsIn,
  MaxLength,
} from 'class-validator';
```

No **final** de `src/employees/employees.dto.ts`, adicionar:

```typescript
// ─── UpdateContractStatusDto ──────────────────────────────────────────────────

export class UpdateContractStatusDto {
  @IsEnum(EmployeeStatus)
  status!: EmployeeStatus;
}

// ─── UpdateCareerPlanStatusDto ────────────────────────────────────────────────

export class UpdateCareerPlanStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED'])
  status!: string;
}
```

- [ ] **Step 4: Actualizar controller**

Adicionar `UpdateContractStatusDto, UpdateCareerPlanStatusDto` ao import dos DTOs em `employees.controller.ts`.

```typescript
// Linha 147 — antes
updateContractStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status: string }) {
  return this.svc.updateContractStatus(id, body.status);
}

// Linha 147 — depois
updateContractStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContractStatusDto) {
  return this.svc.updateContractStatus(id, dto.status);
}

// Linha 215 — antes
updateCareerPlanStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status: string }) {
  return this.svc.updateCareerPlanStatus(id, body.status);
}

// Linha 215 — depois
updateCareerPlanStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCareerPlanStatusDto) {
  return this.svc.updateCareerPlanStatus(id, dto.status);
}
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=employees.dto.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/employees/employees.dto.ts src/employees/employees.dto.spec.ts src/employees/employees.controller.ts
git commit -m "fix(security): validar UpdateContractStatusDto e UpdateCareerPlanStatusDto — A4-PR3"
```

---

### Task 4: CloneRoleDto + PermissionIdsDto em roles-permissions.dto.ts

**Files:**
- Create: `src/roles-permissions/roles-permissions.dto.spec.ts`
- Modify: `src/roles-permissions/roles-permissions.dto.ts`
- Modify: `src/roles-permissions/roles-permissions.controller.ts:91, 125, 134, 143`

**Interfaces:**
- Produces: `CloneRoleDto`, `PermissionIdsDto`

- [ ] **Step 1: Criar ficheiro de teste (RED)**

Criar `src/roles-permissions/roles-permissions.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CloneRoleDto, PermissionIdsDto } from './roles-permissions.dto';

describe('CloneRoleDto', () => {
  it('newName válido passa', async () => {
    const errors = await validate(plainToInstance(CloneRoleDto, { newName: 'MANAGER_V2' }));
    expect(errors).toHaveLength(0);
  });

  it('newName em falta falha', async () => {
    const errors = await validate(plainToInstance(CloneRoleDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('newName acima de 100 chars falha', async () => {
    const errors = await validate(
      plainToInstance(CloneRoleDto, { newName: 'a'.repeat(101) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('PermissionIdsDto', () => {
  it('array de ids válido passa', async () => {
    const errors = await validate(
      plainToInstance(PermissionIdsDto, { permissionIds: [1, 2, 3] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('permissionIds em falta falha', async () => {
    const errors = await validate(plainToInstance(PermissionIdsDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('string no array falha', async () => {
    const errors = await validate(
      plainToInstance(PermissionIdsDto, { permissionIds: ['abc'] }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('array com 201 elementos falha (ArrayMaxSize 200)', async () => {
    const errors = await validate(
      plainToInstance(PermissionIdsDto, {
        permissionIds: Array.from({ length: 201 }, (_, i) => i + 1),
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=roles-permissions.dto.spec --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Adicionar imports e DTOs a roles-permissions.dto.ts**

Acrescentar `IsNotEmpty, ArrayMaxSize` à linha de imports:

```typescript
import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsBoolean,
  Min,
  MaxLength,
  IsNotEmpty,
  ArrayMaxSize,
} from 'class-validator';
```

No final do ficheiro:

```typescript
// ─── CloneRoleDto ────────────────────────────────────────────────────────────

export class CloneRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  newName!: string;
}

// ─── PermissionIdsDto ────────────────────────────────────────────────────────

export class PermissionIdsDto {
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @ArrayMaxSize(200)
  permissionIds!: number[];
}
```

- [ ] **Step 4: Actualizar controller (4 pontos)**

Adicionar `CloneRoleDto, PermissionIdsDto` ao import dos DTOs em `roles-permissions.controller.ts`.

```typescript
// Linha 91 — antes
clone(@Param('id', ParseIntPipe) id: number, @Body() body: { newName: string }) {

// Linha 91 — depois
clone(@Param('id', ParseIntPipe) id: number, @Body() dto: CloneRoleDto) {
  // alterar body.newName → dto.newName na chamada ao service
```

```typescript
// Linhas 125, 134, 143 — antes
@Body() body: { permissionIds: number[] }
// com body.permissionIds na chamada ao service

// Linhas 125, 134, 143 — depois
@Body() dto: PermissionIdsDto
// com dto.permissionIds na chamada ao service
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=roles-permissions.dto.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/roles-permissions/roles-permissions.dto.ts src/roles-permissions/roles-permissions.dto.spec.ts src/roles-permissions/roles-permissions.controller.ts
git commit -m "fix(security): validar CloneRoleDto e PermissionIdsDto — A4-PR3"
```

---

### Task 5: OptionalReasonDto + UpdateExpiresAtDto + ReasonDto em document-repository.dto.ts

**Files:**
- Create: `src/document-repository/document-repository.dto.spec.ts`
- Modify: `src/document-repository/document-repository.dto.ts`
- Modify: `src/document-repository/document-repository.controller.ts:175, 186, 197`

**Interfaces:**
- Produces: `OptionalReasonDto`, `UpdateExpiresAtDto`, `ReasonDto`

- [ ] **Step 1: Criar ficheiro de teste (RED)**

Criar `src/document-repository/document-repository.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  OptionalReasonDto,
  UpdateExpiresAtDto,
  ReasonDto,
} from './document-repository.dto';

describe('OptionalReasonDto', () => {
  it('sem reason passa (campo opcional)', async () => {
    const errors = await validate(plainToInstance(OptionalReasonDto, {}));
    expect(errors).toHaveLength(0);
  });

  it('reason válido passa', async () => {
    const errors = await validate(
      plainToInstance(OptionalReasonDto, { reason: 'Motivo válido' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('reason acima de 1000 chars falha', async () => {
    const errors = await validate(
      plainToInstance(OptionalReasonDto, { reason: 'a'.repeat(1001) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateExpiresAtDto', () => {
  it('data ISO válida passa', async () => {
    const errors = await validate(
      plainToInstance(UpdateExpiresAtDto, { newExpiresAt: '2027-01-01T00:00:00.000Z' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('string não-data falha', async () => {
    const errors = await validate(
      plainToInstance(UpdateExpiresAtDto, { newExpiresAt: 'não é uma data' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('campo em falta falha', async () => {
    const errors = await validate(plainToInstance(UpdateExpiresAtDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('ReasonDto (document-repository)', () => {
  it('reason válido passa', async () => {
    const errors = await validate(plainToInstance(ReasonDto, { reason: 'Motivo' }));
    expect(errors).toHaveLength(0);
  });

  it('reason em falta falha', async () => {
    const errors = await validate(plainToInstance(ReasonDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=document-repository.dto.spec --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Adicionar imports e DTOs**

Verificar os imports existentes em `document-repository.dto.ts` e acrescentar `IsNotEmpty, IsDateString, MaxLength` se não estiverem presentes. No final do ficheiro:

```typescript
// ─── OptionalReasonDto ────────────────────────────────────────────────────────

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

// ─── UpdateExpiresAtDto ───────────────────────────────────────────────────────

export class UpdateExpiresAtDto {
  @IsDateString()
  newExpiresAt!: string;
}

// ─── ReasonDto ────────────────────────────────────────────────────────────────

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
```

- [ ] **Step 4: Actualizar controller**

Adicionar `OptionalReasonDto, UpdateExpiresAtDto, ReasonDto` ao import dos DTOs.

```typescript
// Linha 175 — antes
@Body() body: { reason?: string }
// depois
@Body() dto: OptionalReasonDto
// alterar body.reason → dto.reason

// Linha 186 — antes
@Body() body: { newExpiresAt: string }
// depois
@Body() dto: UpdateExpiresAtDto
// alterar body.newExpiresAt → dto.newExpiresAt

// Linha 197 — antes
@Body() body: { reason: string }
// depois
@Body() dto: ReasonDto
// alterar body.reason → dto.reason
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=document-repository.dto.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/document-repository/document-repository.dto.ts src/document-repository/document-repository.dto.spec.ts src/document-repository/document-repository.controller.ts
git commit -m "fix(security): validar OptionalReasonDto, UpdateExpiresAtDto e ReasonDto — A4-PR3"
```

---

### Task 6: ReasonDto em declarations.dto.ts

**Files:**
- Create: `src/declarations/declarations.dto.spec.ts`
- Modify: `src/declarations/declarations.dto.ts`
- Modify: `src/declarations/declarations.controller.ts:305`

**Interfaces:**
- Produces: `ReasonDto` (nome idêntico ao da Task 5, mas em módulo diferente — sem conflito)

- [ ] **Step 1: Criar ficheiro de teste (RED)**

Criar `src/declarations/declarations.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReasonDto } from './declarations.dto';

describe('ReasonDto (declarations)', () => {
  it('reason válido passa', async () => {
    const errors = await validate(plainToInstance(ReasonDto, { reason: 'Motivo' }));
    expect(errors).toHaveLength(0);
  });

  it('reason em falta falha', async () => {
    const errors = await validate(plainToInstance(ReasonDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reason acima de 1000 chars falha', async () => {
    const errors = await validate(
      plainToInstance(ReasonDto, { reason: 'a'.repeat(1001) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=declarations.dto.spec --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Adicionar imports e DTO**

Acrescentar `IsNotEmpty, MaxLength` aos imports de `class-validator` se não presentes. No final de `src/declarations/declarations.dto.ts`:

```typescript
// ─── ReasonDto ────────────────────────────────────────────────────────────────

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
```

- [ ] **Step 4: Actualizar controller**

Adicionar `ReasonDto` ao import dos DTOs em `declarations.controller.ts`.

```typescript
// Linha 305 — antes
@Body() body: { reason: string }
// com body.reason na chamada ao service

// Linha 305 — depois
@Body() dto: ReasonDto
// com dto.reason na chamada ao service
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=declarations.dto.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/declarations/declarations.dto.ts src/declarations/declarations.dto.spec.ts src/declarations/declarations.controller.ts
git commit -m "fix(security): validar ReasonDto em declarations — A4-PR3"
```

---

### Task 7: ValidateApiKeyBodyDto em api-integration.dto.ts

**Files:**
- Create: `src/api-integration/api-integration.dto.spec.ts`
- Modify: `src/api-integration/api-integration.dto.ts`
- Modify: `src/api-integration/api-integration.controller.ts:132`

**Interfaces:**
- Produces: `ValidateApiKeyBodyDto`

- [ ] **Step 1: Criar ficheiro de teste (RED)**

Criar `src/api-integration/api-integration.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ValidateApiKeyBodyDto } from './api-integration.dto';

describe('ValidateApiKeyBodyDto', () => {
  it('key válida passa', async () => {
    const errors = await validate(
      plainToInstance(ValidateApiKeyBodyDto, { key: 'sk-test-1234' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('key em falta falha', async () => {
    const errors = await validate(plainToInstance(ValidateApiKeyBodyDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('key acima de 512 chars falha', async () => {
    const errors = await validate(
      plainToInstance(ValidateApiKeyBodyDto, { key: 'a'.repeat(513) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=api-integration.dto.spec --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Adicionar imports e DTO**

Acrescentar `IsNotEmpty` aos imports se não presente. No final de `src/api-integration/api-integration.dto.ts`:

```typescript
// ─── ValidateApiKeyBodyDto ────────────────────────────────────────────────────

export class ValidateApiKeyBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key!: string;
}
```

- [ ] **Step 4: Actualizar controller**

Adicionar `ValidateApiKeyBodyDto` ao import dos DTOs.

```typescript
// Linha 132 — antes
validateApiKey(@Body() body: { key: string }) {

// Linha 132 — depois
validateApiKey(@Body() dto: ValidateApiKeyBodyDto) {
  // alterar body.key → dto.key
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=api-integration.dto.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/api-integration/api-integration.dto.ts src/api-integration/api-integration.dto.spec.ts src/api-integration/api-integration.controller.ts
git commit -m "fix(security): validar ValidateApiKeyBodyDto — A4-PR3"
```

---

### Task 8: UploadKnowledgeDto em avatar-training.dto.ts

**Files:**
- Create: `src/avatar-training/avatar-training.dto.spec.ts`
- Modify: `src/avatar-training/avatar-training.dto.ts`
- Modify: `src/avatar-training/avatar-training.controller.ts:87`

**Interfaces:**
- Produces: `UploadKnowledgeDto`

- [ ] **Step 1: Criar ficheiro de teste (RED)**

Criar `src/avatar-training/avatar-training.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UploadKnowledgeDto } from './avatar-training.dto';

describe('UploadKnowledgeDto', () => {
  it('fileUrl e title válidos passam', async () => {
    const errors = await validate(
      plainToInstance(UploadKnowledgeDto, {
        fileUrl: 'https://example.com/doc.pdf',
        title: 'Manual de Onboarding',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('fileUrl inválida (não é URL) falha', async () => {
    const errors = await validate(
      plainToInstance(UploadKnowledgeDto, { fileUrl: 'não-é-url', title: 'Manual' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('title em falta falha', async () => {
    const errors = await validate(
      plainToInstance(UploadKnowledgeDto, { fileUrl: 'https://example.com/doc.pdf' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('title acima de 200 chars falha', async () => {
    const errors = await validate(
      plainToInstance(UploadKnowledgeDto, {
        fileUrl: 'https://example.com/doc.pdf',
        title: 'a'.repeat(201),
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=avatar-training.dto.spec --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Adicionar imports e DTO**

Acrescentar `IsUrl, IsNotEmpty, MaxLength` aos imports se não presentes. No final de `src/avatar-training/avatar-training.dto.ts`:

```typescript
// ─── UploadKnowledgeDto ───────────────────────────────────────────────────────

export class UploadKnowledgeDto {
  @IsUrl()
  fileUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
```

- [ ] **Step 4: Actualizar controller**

Adicionar `UploadKnowledgeDto` ao import dos DTOs.

```typescript
// Linha 87 — antes
@Body() body: { fileUrl: string; title: string }
// com body.fileUrl e body.title

// Linha 87 — depois
@Body() dto: UploadKnowledgeDto
// com dto.fileUrl e dto.title
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=avatar-training.dto.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/avatar-training/avatar-training.dto.ts src/avatar-training/avatar-training.dto.spec.ts src/avatar-training/avatar-training.controller.ts
git commit -m "fix(security): validar UploadKnowledgeDto — A4-PR3"
```

---

### Task 9: PayoutDto em instructor.dto.ts

**Files:**
- Create: `src/instructor/instructor.dto.spec.ts`
- Modify: `src/instructor/instructor.dto.ts`
- Modify: `src/instructor/instructor.controller.ts:195`

**Interfaces:**
- Produces: `PayoutDto`

- [ ] **Step 1: Criar ficheiro de teste (RED)**

Criar `src/instructor/instructor.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PayoutDto } from './instructor.dto';

describe('PayoutDto', () => {
  it('amount válido passa', async () => {
    const errors = await validate(plainToInstance(PayoutDto, { amount: 150.5 }));
    expect(errors).toHaveLength(0);
  });

  it('amount zero falha (Min 0.01)', async () => {
    const errors = await validate(plainToInstance(PayoutDto, { amount: 0 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('amount negativo falha', async () => {
    const errors = await validate(plainToInstance(PayoutDto, { amount: -10 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('amount em falta falha', async () => {
    const errors = await validate(plainToInstance(PayoutDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('string em vez de número falha', async () => {
    const errors = await validate(plainToInstance(PayoutDto, { amount: 'cem' }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=instructor.dto.spec --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Adicionar imports e DTO**

Acrescentar `IsNotEmpty` ao import se não presente. No final de `src/instructor/instructor.dto.ts`:

```typescript
// ─── PayoutDto ────────────────────────────────────────────────────────────────

export class PayoutDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;
}
```

- [ ] **Step 4: Actualizar controller**

Adicionar `PayoutDto` ao import dos DTOs.

```typescript
// Linha 195 — antes
payout(@Param('id', ParseIntPipe) id: number, @Body() body: { amount: number }) {

// Linha 195 — depois
payout(@Param('id', ParseIntPipe) id: number, @Body() dto: PayoutDto) {
  // alterar body.amount → dto.amount
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=instructor.dto.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/instructor/instructor.dto.ts src/instructor/instructor.dto.spec.ts src/instructor/instructor.controller.ts
git commit -m "fix(security): validar PayoutDto — A4-PR3"
```

---

### Task 10: Complete1on1Dto em leader.dto.ts

**Files:**
- Create: `src/leader/leader.dto.spec.ts`
- Modify: `src/leader/leader.dto.ts`
- Modify: `src/leader/leader.controller.ts:152`

**Interfaces:**
- Produces: `Complete1on1Dto`

- [ ] **Step 1: Criar ficheiro de teste (RED)**

Criar `src/leader/leader.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Complete1on1Dto } from './leader.dto';

describe('Complete1on1Dto', () => {
  it('notes válidas passam', async () => {
    const errors = await validate(
      plainToInstance(Complete1on1Dto, { notes: 'Reunião correu bem.' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('notes em falta falha', async () => {
    const errors = await validate(plainToInstance(Complete1on1Dto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('notes acima de 5000 chars falha', async () => {
    const errors = await validate(
      plainToInstance(Complete1on1Dto, { notes: 'a'.repeat(5001) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Confirmar RED**

```powershell
npx jest --testPathPattern=leader.dto.spec --no-coverage
```

Expected: FAIL.

- [ ] **Step 3: Adicionar imports e DTO**

Acrescentar `IsNotEmpty` ao import se não presente. No final de `src/leader/leader.dto.ts`:

```typescript
// ─── Complete1on1Dto ──────────────────────────────────────────────────────────

export class Complete1on1Dto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  notes!: string;
}
```

- [ ] **Step 4: Actualizar controller**

Adicionar `Complete1on1Dto` ao import dos DTOs.

```typescript
// Linha 152 — antes
complete1on1(@Param('id', ParseIntPipe) id: number, @Body() body: { notes: string }) {

// Linha 152 — depois
complete1on1(@Param('id', ParseIntPipe) id: number, @Body() dto: Complete1on1Dto) {
  // alterar body.notes → dto.notes
```

- [ ] **Step 5: Confirmar GREEN**

```powershell
npx jest --testPathPattern=leader.dto.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/leader/leader.dto.ts src/leader/leader.dto.spec.ts src/leader/leader.controller.ts
git commit -m "fix(security): validar Complete1on1Dto — A4-PR3"
```

---

### Task 11: work-declaration — usar UpsertTenantConfigDto existente

**Files:**
- Modify: `src/work-declaration/work-declaration.controller.ts:389`

**Interfaces:**
- Consumes: `UpsertTenantConfigDto` já existe em `src/work-declaration/work-declaration.dto.ts` com validadores completos
- Produces: controller passa a rejeitar payloads inválidos via ValidationPipe

- [ ] **Step 1: Verificar que UpsertTenantConfigDto já está exportado**

```powershell
Select-String -Path "src\work-declaration\work-declaration.dto.ts" -Pattern "export class UpsertTenantConfigDto"
```

Expected: 1 resultado — a classe existe.

- [ ] **Step 2: Actualizar controller (mudança de tipo)**

Em `src/work-declaration/work-declaration.controller.ts`, confirmar que `UpsertTenantConfigDto` está no import dos DTOs. Alterar linha 389:

```typescript
// Antes
async updateBrandingSettings(
  @Body() settings: Record<string, unknown>,
  @CurrentUser() user: IAuthUser,
) {
  return this.workDeclarationService.upsertTenantConfig((user as any).tenantId, settings as any);
}

// Depois
async updateBrandingSettings(
  @Body() dto: UpsertTenantConfigDto,
  @CurrentUser() user: IAuthUser,
) {
  return this.workDeclarationService.upsertTenantConfig((user as any).tenantId, dto);
}
```

- [ ] **Step 3: Verificar tipos**

```powershell
npx tsc --noEmit --project tsconfig.build.json 2>&1 | Select-String "work-declaration"
```

Expected: sem erros.

- [ ] **Step 4: Correr testes existentes do módulo**

```powershell
npx jest --testPathPattern=work-declaration --no-coverage
```

Expected: PASS — sem regressões.

- [ ] **Step 5: Verificar zero inline bodies restantes**

```powershell
Select-String -Path "src\**\*.controller.ts" -Pattern "@Body\(\) \w+: \{" -Recurse
```

Expected: 0 resultados — todos os inline bodies substituídos.

- [ ] **Step 6: Verificar tsc global**

```powershell
npx tsc --noEmit --project tsconfig.build.json 2>&1 | Select-String "error TS"
```

Expected: 0 erros.

- [ ] **Step 7: Commit final**

```powershell
git add src/work-declaration/work-declaration.controller.ts
git commit -m "fix(security): usar UpsertTenantConfigDto existente em updateBrandingSettings — A4-PR3"
```
