# Faixa A-Authz — Hardening de Autorização ao Nível do Dado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 3 lacunas de autorização: MobileController sem ownership check, ~13 endpoints sem `@Roles()` explícito, e download/visualização de certificados sem verificação de posse.

**Architecture:** Edições cirúrgicas em 7 ficheiros. Reutiliza os guards globais existentes (`JwtAuthGuard`, `RolesGuard`), o utilitário `assertCanAccess` de `src/common/authz/ownership.ts`, e o decorator `@Roles()` de `src/common/decorators`. Nenhuma nova dependência npm.

**Tech Stack:** NestJS, `@nestjs/core` Reflector, `assertCanAccess` (utilitário existente), Role enum existente.

## Global Constraints

- Campo `fullName` nos modelos User — nunca `name`
- `assertCanAccess` de `src/common/authz/ownership.ts` — assinatura: `assertCanAccess(resource, ownerId, user: { id: number; role?: { name: string } | null }, privilegedRoles?: Role[])`; lança `NotFoundException` quando ownership falha
- `AUTHENTICATED_ROLES` definido em `src/auth/enums/role.enum.ts` — não criar novo ficheiro
- `@Roles()` de `src/common/decorators` — assinatura: `Roles(...roles: string[])`
- `CurrentUserData` de `src/common/decorators` — tem campos `id: number` e `role: { id: number; name: string } | null`
- Testes correm com `npx jest --testPathPattern=<ficheiro> --no-coverage`
- Tasks devem ser implementadas por ordem (1 → 2 → 3) — Task 3 muda assinaturas que Task 2 prepara

---

### Task 1: MobileController — substituir userId do body/path por CurrentUser

**Files:**
- Modify: `src/mobile/mobile.controller.ts`
- Modify: `src/mobile/mobile.service.ts`
- Create: `src/mobile/mobile.controller.spec.ts`

**Interfaces:**
- Consumes: `CurrentUserData` de `src/common/decorators` (campo usado: `id: number`)
- Produces:
  - `MobileController` com 4 endpoints — `userId` removido do body/path, derivado do JWT
  - `MobileService.updatePushToken(sessionId: number, pushToken: string, userId: number)` — novo terceiro argumento

- [ ] **Step 1: Escrever testes (RED)**

Criar `src/mobile/mobile.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { CurrentUserData } from '../common/decorators';

const mockUser: CurrentUserData = {
  id: 42,
  email: 'test@innova.com',
  active: true,
  roleId: 1,
  role: { id: 1, name: 'COLABORADOR' },
};

const mockService = {
  registerSession: jest.fn().mockResolvedValue({ id: 1 }),
  updatePushToken: jest.fn().mockResolvedValue({ updated: true }),
  logSync: jest.fn().mockResolvedValue({ id: 1 }),
  getUserMobileDashboard: jest.fn().mockResolvedValue({ enrollments: [], evaluations: [] }),
};

describe('MobileController', () => {
  let controller: MobileController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileController],
      providers: [{ provide: MobileService, useValue: mockService }],
    }).compile();
    controller = module.get<MobileController>(MobileController);
  });

  it('registerSession usa user.id do JWT — não aceita userId do body', async () => {
    await controller.registerSession('dev-001', 'ios', mockUser, 'push-tok');
    expect(mockService.registerSession).toHaveBeenCalledWith(42, 'dev-001', 'ios', 'push-tok');
  });

  it('logSync usa user.id do JWT — não aceita userId do body', async () => {
    await controller.logSync('enrollment', 'SUCCESS', mockUser);
    expect(mockService.logSync).toHaveBeenCalledWith(42, 'enrollment', 'SUCCESS');
  });

  it('getDashboard usa user.id do JWT — não aceita userId do path', async () => {
    await controller.getDashboard(mockUser);
    expect(mockService.getUserMobileDashboard).toHaveBeenCalledWith(42);
  });

  it('updatePushToken passa sessionId + pushToken + userId do JWT', async () => {
    await controller.updatePushToken(7, 'new-tok', mockUser);
    expect(mockService.updatePushToken).toHaveBeenCalledWith(7, 'new-tok', 42);
  });
});
```

- [ ] **Step 2: Verificar que os testes falham (RED)**

```bash
npx jest mobile.controller.spec --no-coverage
```

Expected: FAIL — métodos do controller têm assinaturas diferentes das esperadas.

- [ ] **Step 3: Substituir mobile.controller.ts**

Substituir `src/mobile/mobile.controller.ts` integralmente:

```typescript
import { Controller, Post, Body, Param, Patch, Get, ParseIntPipe } from '@nestjs/common';
import { MobileService } from './mobile.service';
import { CurrentUser, CurrentUserData } from '../common/decorators';

@Controller('mobile')
export class MobileController {
  constructor(private mobileService: MobileService) {}

  @Post('session')
  registerSession(
    @Body('deviceId') deviceId: string,
    @Body('platform') platform: string,
    @CurrentUser() user: CurrentUserData,
    @Body('pushToken') pushToken?: string,
  ) {
    return this.mobileService.registerSession(user.id, deviceId, platform, pushToken);
  }

  @Patch('session/:id/push-token')
  updatePushToken(
    @Param('id', ParseIntPipe) id: number,
    @Body('pushToken') pushToken: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.mobileService.updatePushToken(id, pushToken, user.id);
  }

  @Post('sync-log')
  logSync(
    @Body('entity') entity: string,
    @Body('status') status: 'SUCCESS' | 'FAILED',
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.mobileService.logSync(user.id, entity, status);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: CurrentUserData) {
    return this.mobileService.getUserMobileDashboard(user.id);
  }
}
```

- [ ] **Step 4: Actualizar updatePushToken no MobileService**

Em `src/mobile/mobile.service.ts`, adicionar `NotFoundException` ao import se não existir:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
```

Substituir o método `updatePushToken`:

```typescript
async updatePushToken(sessionId: number, pushToken: string, userId: number) {
  const result = await this.prisma.mobileSession.updateMany({
    where: { id: sessionId, userId },
    data: { pushToken },
  });
  if (result.count === 0) throw new NotFoundException('Sessão não encontrada');
  return { updated: true };
}
```

- [ ] **Step 5: Verificar que os testes passam (GREEN)**

```bash
npx jest mobile.controller.spec --no-coverage
```

Expected: `Tests: 4 passed, 4 total`

- [ ] **Step 6: Commit**

```bash
git add src/mobile/mobile.controller.ts src/mobile/mobile.service.ts src/mobile/mobile.controller.spec.ts
git commit -m "fix(mobile): substituir userId body/path por CurrentUser — fechar IDOR crítico (A-3-1)"
```

---

### Task 2: AUTHENTICATED_ROLES + @Roles() explícito em 13 endpoints

**Files:**
- Modify: `src/auth/enums/role.enum.ts`
- Modify: `src/courses/courses.controller.ts`
- Modify: `src/assessments/assessments.controller.ts`
- Modify: `src/certification/certification.controller.ts`
- Modify: `src/departments/departments.controller.ts`
- Create: `src/auth/enums/role.enum.spec.ts`

**Interfaces:**
- Produces: `AUTHENTICATED_ROLES: readonly string[]` exportado de `src/auth/enums/role.enum.ts`

**Nota sobre a certification.controller.ts:** Os endpoints `GET /certification/certificates/:id` e `POST /certification/certificates/:id/download` recebem `@CurrentUser() user` nesta task, mas as chamadas ao serviço ainda usam as assinaturas antigas (`service.findCertificateById(id)` e `service.downloadCertificate(id, user.id)`). A Task 3 actualiza as assinaturas do serviço e as calls do controller.

- [ ] **Step 1: Escrever testes para AUTHENTICATED_ROLES e metadata de roles (RED)**

Criar `src/auth/enums/role.enum.spec.ts`:

```typescript
import { Role, AUTHENTICATED_ROLES } from './role.enum';

describe('AUTHENTICATED_ROLES', () => {
  it('contém todos os valores únicos do enum Role', () => {
    const uniqueValues = [...new Set(Object.values(Role))];
    expect(Array.from(AUTHENTICATED_ROLES)).toHaveLength(uniqueValues.length);
    for (const value of uniqueValues) {
      expect(AUTHENTICATED_ROLES).toContain(value);
    }
  });
});

describe('Roles metadata — DepartmentsController (Grupo B)', () => {
  it('findOne exige GESTOR, RH, ADMIN ou DIRECTOR', () => {
    const { DepartmentsController } = require('../departments/departments.controller');
    const { ROLES_KEY } = require('../common/decorators/roles.decorator');
    const meta: string[] | undefined = Reflect.getMetadata(ROLES_KEY, DepartmentsController.prototype.findOne);
    expect(meta).toBeDefined();
    expect(meta).toEqual(expect.arrayContaining([Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR]));
    expect(meta).not.toContain(Role.COLABORADOR);
  });

  it('findAll permite qualquer autenticado (contém COLABORADOR)', () => {
    const { DepartmentsController } = require('../departments/departments.controller');
    const { ROLES_KEY } = require('../common/decorators/roles.decorator');
    const meta: string[] | undefined = Reflect.getMetadata(ROLES_KEY, DepartmentsController.prototype.findAll);
    expect(meta).toBeDefined();
    expect(meta).toContain(Role.COLABORADOR);
  });
});
```

- [ ] **Step 2: Verificar que os testes falham (RED)**

```bash
npx jest role.enum.spec --no-coverage
```

Expected: FAIL — `AUTHENTICATED_ROLES` não existe.

- [ ] **Step 3: Adicionar AUTHENTICATED_ROLES ao role.enum.ts**

Em `src/auth/enums/role.enum.ts`, adicionar no fim do ficheiro após o enum `Role`:

```typescript
/**
 * Todos os papéis activos — para endpoints acessíveis a qualquer utilizador autenticado.
 * Usar com @Roles(...AUTHENTICATED_ROLES) em vez de omitir o decorator (que é fail-open).
 * Não inclui aliases (HR, EMPLOYEE) — o RolesGuard compara com user.role.name.
 */
export const AUTHENTICATED_ROLES = [
  Role.COLABORADOR,
  Role.LIDER,
  Role.GESTOR,
  Role.RH,
  Role.ADMIN,
  Role.INSTRUCTOR,
  Role.DIRECTOR,
  Role.AUDITOR,
] as const;
```

- [ ] **Step 4: Adicionar @Roles em courses.controller.ts**

Em `src/courses/courses.controller.ts`, adicionar o import após os imports existentes:

```typescript
import { AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
```

Adicionar `@Roles(...AUTHENTICATED_ROLES)` nos 4 endpoints que não têm decorator de roles. Localizar cada método pelo nome e adicionar o decorator entre a anotação do Swagger e a declaração do método:

```typescript
  @Get()
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Catálogo de cursos com filtros e paginação' })
  findAll(@Query() filters: CourseFilterDto) { ... }

  @Get('categories')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Listar categorias disponíveis com contagem' })
  categories() { ... }

  @Get('certificates/verify/:code')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Verificar validade de certificado por código' })
  verifyCertificate(@Param('code') code: string) { ... }

  @Get(':id')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Detalhe completo do curso (módulos, aulas, feedback)' })
  findOne(@Param('id', ParseIntPipe) id: number) { ... }
```

Não alterar mais nada neste ficheiro.

- [ ] **Step 5: Adicionar @Roles em assessments.controller.ts**

Em `src/assessments/assessments.controller.ts`, adicionar o import:

```typescript
import { AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
```

Adicionar `@Roles(...AUTHENTICATED_ROLES)` nos 3 endpoints sem decorator:

```typescript
  @Get()
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Listar avaliações com filtros' })
  findAll(@Query() filters: AssessmentFilterDto) { ... }

  @Get(':id')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Detalhe da avaliação (sem respostas correctas para colaborador)' })
  findOne(@Param('id', ParseIntPipe) id: number) { ... }

  @Get('attempts/:attemptId')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Detalhe de uma tentativa (para revisão)' })
  attemptDetail(
    @Param('attemptId', ParseIntPipe) attemptId: number,
    @CurrentUser() user: CurrentUserData,
  ) { ... }
```

- [ ] **Step 6: Adicionar @Roles em certification.controller.ts**

Em `src/certification/certification.controller.ts`, adicionar o import:

```typescript
import { AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
```

Cinco endpoints a atualizar. Para `findCertificateById` e `download`, adicionar também `@CurrentUser()` (necessário para a Task 3) mas manter as chamadas ao serviço inalteradas por agora:

```typescript
  @Get('templates')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Listar templates' })
  findAllTemplates() {
    return this.service.findAllTemplates();
  }

  @Get('my-certificates')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Meus certificados' })
  getMyCertificates(
    @CurrentUser() user: CurrentUserData,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getMyCertificates(user.id, page, limit);
  }

  @Get('certificates/:id')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Detalhe de certificado' })
  findCertificateById(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.findCertificateById(id);   // assinatura actualizada na Task 3
  }

  @Post('certificates/:id/download')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Download de certificado' })
  download(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.downloadCertificate(id, user.id);   // assinatura actualizada na Task 3
  }

  @Get('badges')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Listar badges' })
  findAllBadges() {
    return this.service.findAllBadges();
  }
```

- [ ] **Step 7: Adicionar @Roles em departments.controller.ts**

Em `src/departments/departments.controller.ts`, o import de `AUTHENTICATED_ROLES`:

```typescript
import { AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
```

Quatro endpoints a atualizar (dois Grupo A, dois Grupo B):

```typescript
  @Get()
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Listar departamentos (com filtros e paginação)' })
  findAll(@Query() filters: DepartmentFilterDto) { ... }

  @Get('tree')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Árvore hierárquica completa (Org Chart)' })
  getTree() { ... }

  @Get(':id')
  @Roles(Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR)
  @ApiOperation({ summary: 'Detalhe do departamento (membros, sub-deptos, histórico)' })
  findOne(@Param('id', ParseIntPipe) id: number) { ... }

  @Get(':id/metrics')
  @Roles(Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR)
  @ApiOperation({ summary: 'Métricas do departamento' })
  metrics(@Param('id', ParseIntPipe) id: number) { ... }
```

- [ ] **Step 8: Verificar que os testes passam (GREEN)**

```bash
npx jest role.enum.spec --no-coverage
```

Expected: `Tests: 3 passed, 3 total`

- [ ] **Step 9: Commit**

```bash
git add src/auth/enums/role.enum.ts src/auth/enums/role.enum.spec.ts src/courses/courses.controller.ts src/assessments/assessments.controller.ts src/certification/certification.controller.ts src/departments/departments.controller.ts
git commit -m "feat(authz): AUTHENTICATED_ROLES + @Roles explícito em 13 endpoints — fechar fail-open (A-3-2)"
```

---

### Task 3: Certification — ownership check + actualizar assinaturas do serviço

**Files:**
- Modify: `src/certification/certification.service.ts`
- Modify: `src/certification/certification.controller.ts` (actualizar calls ao serviço)
- Create: `src/certification/certification.service.ownership.spec.ts`

**Interfaces:**
- Consumes:
  - `assertCanAccess` de `src/common/authz/ownership.ts`
  - `Role` de `src/auth/enums/role.enum`
  - `cert.userId` — campo escalar no modelo `issuedCertificate` (presente porque a query usa `include`, não `select`)
- Produces:
  - `findCertificateById(id: string, user: { id: number; role?: { name: string } | null }): Promise<IssuedCertificate>` — novo segundo argumento
  - `downloadCertificate(id: string, user: { id: number; role?: { name: string } | null }): Promise<...>` — `user` em vez de `userId: number`

- [ ] **Step 1: Escrever testes de ownership (RED)**

Criar `src/certification/certification.service.ownership.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';

// Testa a lógica de ownership directamente — isola a função pura dos detalhes do serviço
const mockCert = {
  id: 'cert-abc',
  userId: 10,
  code: 'CERT-00001',
  pdfUrl: '/pdf/cert-abc.pdf',
  publicUrl: '/pub/cert-abc',
  title: 'Certificado Curso X',
  deletedAt: null,
};

const owner      = { id: 10, role: { name: 'COLABORADOR' } };
const otherUser  = { id: 99, role: { name: 'COLABORADOR' } };
const adminUser  = { id: 1,  role: { name: 'ADMIN' } };
const rhUser     = { id: 2,  role: { name: 'RH' } };

describe('assertCanAccess — regras de ownership de certificados', () => {
  const privileged = [Role.ADMIN, Role.RH];

  it('dono do certificado passa sem excepção', () => {
    expect(() => assertCanAccess(mockCert, mockCert.userId, owner, privileged)).not.toThrow();
  });

  it('utilizador diferente lança NotFoundException', () => {
    expect(() => assertCanAccess(mockCert, mockCert.userId, otherUser, privileged)).toThrow(NotFoundException);
  });

  it('ADMIN passa independentemente do userId', () => {
    expect(() => assertCanAccess(mockCert, mockCert.userId, adminUser, privileged)).not.toThrow();
  });

  it('RH passa independentemente do userId', () => {
    expect(() => assertCanAccess(mockCert, mockCert.userId, rhUser, privileged)).not.toThrow();
  });

  it('recurso null lança NotFoundException (cert não encontrado)', () => {
    expect(() => assertCanAccess(null, 10, owner, privileged)).toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Verificar que os testes passam imediatamente**

```bash
npx jest certification.service.ownership.spec --no-coverage
```

Expected: `Tests: 5 passed, 5 total` — `assertCanAccess` já existe e é correcto. Se algum falhar, o utilitário tem um bug — investiga antes de continuar.

- [ ] **Step 3: Actualizar findCertificateById no serviço**

Em `src/certification/certification.service.ts`, adicionar imports no topo (se não existirem):

```typescript
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
```

Localizar o método `findCertificateById` (actualmente com assinatura `findCertificateById(id: string)`). Substituí-lo:

```typescript
async findCertificateById(id: string, user: { id: number; role?: { name: string } | null }) {
  const cert = await this.prisma.read.issuedCertificate.findUnique({
    where: { id },
    include: {
      user: { select: { fullName: true, email: true } },
      template: { select: { name: true, html: true } },
      issuedBy: { select: { fullName: true } },
    },
  });
  if (!cert || cert.deletedAt) throw new NotFoundException('Certificado não encontrado');
  assertCanAccess(cert, cert.userId, user, [Role.ADMIN, Role.RH]);
  return cert;
}
```

- [ ] **Step 4: Actualizar downloadCertificate no serviço**

Localizar o método `downloadCertificate` (actualmente com assinatura `downloadCertificate(id: string, userId: number)`). Substituí-lo:

```typescript
async downloadCertificate(id: string, user: { id: number; role?: { name: string } | null }) {
  const cert = await this.findCertificateById(id, user);
  await this.prisma.issuedCertificate.update({
    where: { id },
    data: { downloadCount: { increment: 1 } },
  });
  await this.audit.logEntity(user.id, 'DOWNLOAD', 'IssuedCertificate', id, {
    code: cert.code,
  });
  return { pdfUrl: cert.pdfUrl, publicUrl: cert.publicUrl, title: cert.title };
}
```

- [ ] **Step 5: Actualizar as calls do controller em certification.controller.ts**

Em `src/certification/certification.controller.ts`, as duas calls ao serviço que foram deixadas com assinaturas antigas na Task 2:

```typescript
  @Get('certificates/:id')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Detalhe de certificado' })
  findCertificateById(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.findCertificateById(id, user);   // passa user completo
  }

  @Post('certificates/:id/download')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Download de certificado' })
  download(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.downloadCertificate(id, user);   // passa user em vez de user.id
  }
```

- [ ] **Step 6: Verificar que a suite de ownership passa e que não há regressões nos outros testes**

```bash
npx jest "certification.service.ownership.spec|mobile.controller.spec|role.enum.spec" --no-coverage
```

Expected: `Tests: 12 passed, 12 total` (5 + 4 + 3)

- [ ] **Step 7: Commit**

```bash
git add src/certification/certification.service.ts src/certification/certification.controller.ts src/certification/certification.service.ownership.spec.ts
git commit -m "fix(certification): ownership check em findCertificateById e downloadCertificate (A-3-3)"
```
