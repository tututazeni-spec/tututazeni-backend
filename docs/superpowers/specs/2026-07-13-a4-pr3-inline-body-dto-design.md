# Design: A4-PR3 — Substituir inline @Body interfaces por DTOs com class-validator

**Data:** 2026-07-13
**Faixa de auditoria:** A-4 (Validação de input no backend)
**Severidade:** 🟠 Alto

## Problema

18 endpoints NestJS aceitam `@Body()` com plain TypeScript interfaces (`{ key: string }`, `Record<string, unknown>`, etc.) em vez de classes decoradas com `class-validator`. TypeScript interfaces são apagadas em runtime — o `ValidationPipe` global (configurado com `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) não consegue validar nada e passa o payload sem qualquer verificação ao service.

**Caso mais crítico (acessível a todos os utilizadores autenticados):**
`PATCH /notifications/my/read-bulk` aceita `{ ids: number[] }` sem limite de tamanho nem validação de tipo → DoS com array de 100k IDs.

## Solução

Criar um DTO com decoradores `class-validator` por cada endpoint afectado, no ficheiro `.dto.ts` existente do módulo (Abordagem C — co-localização). O controller passa a tipar o parâmetro com esse DTO; a `ValidationPipe` global trata do resto.

Excepção: `work-declaration` — `UpsertTenantConfigDto` já existe com todos os validadores; o controller só precisa de alterar o tipo de `Record<string, unknown>` para `UpsertTenantConfigDto`.

## Os 18 casos

### 1 — `api-integration.dto.ts` → `ValidateApiKeyBodyDto`
```typescript
export class ValidateApiKeyBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key!: string;
}
```
Controller: `src/api-integration/api-integration.controller.ts:132`

### 2 — `avatar-training.dto.ts` → `UploadKnowledgeDto`
```typescript
export class UploadKnowledgeDto {
  @IsUrl()
  fileUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
```
Controller: `src/avatar-training/avatar-training.controller.ts:87`

### 3 — `declarations.dto.ts` → `ReasonDto`
```typescript
export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
```
Controller: `src/declarations/declarations.controller.ts:305`

### 4, 5, 6 — `document-repository.dto.ts` → 3 DTOs
```typescript
export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class UpdateExpiresAtDto {
  @IsDateString()
  newExpiresAt!: string;
}

// ReasonDto (idêntico ao caso 3 — definido no mesmo ficheiro)
export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
```
Controller: `src/document-repository/document-repository.controller.ts:175, 186, 197`

### 7, 8 — `employees.dto.ts` → 2 DTOs de status
```typescript
export class UpdateContractStatusDto {
  @IsEnum(EmployeeStatus)   // enum já existe no mesmo ficheiro
  status!: EmployeeStatus;
}

export class UpdateCareerPlanStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED'])
  status!: string;
}
```
Controller: `src/employees/employees.controller.ts:147, 215`

### 9 — `instructor.dto.ts` → `PayoutDto`
```typescript
export class PayoutDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;
}
```
Controller: `src/instructor/instructor.controller.ts:195`

### 10 — `leader.dto.ts` → `Complete1on1Dto`
```typescript
export class Complete1on1Dto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  notes!: string;
}
```
Controller: `src/leader/leader.controller.ts:152`

### 11, 12, 13 — `notifications.dto.ts` → 3 DTOs
```typescript
export class ReadBulkDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];
}

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
Controller: `src/notifications/notifications.controller.ts:70, 157, 189`

### 14, 15–17 — `roles-permissions.dto.ts` → 2 DTOs
```typescript
export class CloneRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  newName!: string;
}

export class PermissionIdsDto {
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @ArrayMaxSize(200)
  permissionIds!: number[];
}
```
Controller: `src/roles-permissions/roles-permissions.controller.ts:91, 125, 134, 143`

### 18 — `work-declaration` controller — usar DTO existente
`UpsertTenantConfigDto` já existe em `work-declaration.dto.ts` com todos os validadores. Alterar apenas:
```typescript
// Antes
async updateBrandingSettings(@Body() settings: Record<string, unknown>, ...)

// Depois
async updateBrandingSettings(@Body() settings: UpsertTenantConfigDto, ...)
```
Controller: `src/work-declaration/work-declaration.controller.ts:389`

## Testes

**Por cada novo DTO** (unitário, no `.spec.ts` do módulo ou `.dto.spec.ts` novo):
- Payload válido → instância válida (0 erros)
- Campo obrigatório omitido → erro de validação
- Campo com valor inválido (tipo errado, excede MaxLength, enum inválido) → erro de validação

**Para `ReadBulkDto`** (teste adicional de integração no controller spec):
- Array com 101 elementos → 400 Bad Request
- Array com string em vez de number → 400 Bad Request
- Array vazio → comportamento definido (400 ou [] — depende do service)

## Critério de sucesso

- Zero `@Body() body: { ... }` inline restantes nos controllers
- `npx tsc --noEmit` sem erros
- Todos os testes unitários dos DTOs a verde
- `npx jest --testPathPattern=dto` a verde
