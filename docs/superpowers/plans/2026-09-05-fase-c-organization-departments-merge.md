# Fase C — Fundir `organization` em `departments` — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** As operações de **escrita** de `Department`, `Position` e `Unit` deixam de ter duas implementações divergentes (`organization.service.ts` vs `departments.service.ts`) — passa a existir uma única, nos serviços canónicos de `departments`, com `OrganizationService` a delegar. Nenhuma rota muda.

**Architecture:** `OrganizationModule` importa `DepartmentsModule` (que já exporta `DepartmentsService`, `PositionsService`, `UnitsService`). `OrganizationService` injecta os 3 e os seus métodos `createDepartment`/`updateDepartment`/`deleteDepartment`/`createPosition`/`updatePosition`/`deletePosition`/`createUnit`/`updateUnit` passam a chamar os serviços canónicos em vez de `this.prisma.<model>` directo. Os serviços canónicos são **estendidos** para serem um superconjunto: absorvem as validações e campos que só `organization` tinha (`unitId`/`annualBudget`/`status` no Department, code case-insensitive + uppercase, dup-check de posição por departamento, `headcountPlanned` default, hard-delete guardado). Os métodos de **leitura** de `organization` (`getDepartments`, `getDepartmentDetails`, `getPositions`, `getUnits`) ficam onde estão — são projecções read-only para o org-chart, excepção tolerada por `docs/arquitetura-modular-analise.md` §4. Sem ciclo de módulos: `organization` → `departments` → (só Prisma).

**Tech Stack:** NestJS, Prisma, Jest (unit + integração com Postgres real via `test/jest-integration.json`), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (§2.3 item 11, §2.5, §3–4 domínio 2, §5 item 4, §13 fase C) e `docs/arquitetura-modular.md` (Fases 3–5).

## Global Constraints

- **Nenhuma rota, verbo ou forma de resposta muda** (`docs/arquitetura-modular.md` §12). Preservados exactamente:
  - `POST /organization/departments`, `PUT /organization/departments/:id`, `DELETE /organization/departments/:id`
  - `POST /organization/positions`, `PUT /organization/positions/:id`, `DELETE /organization/positions/:id`
  - `POST /organization/units`, `PUT /organization/units/:id`
  - `GET /organization/departments`, `GET /organization/departments/:id`, `GET /organization/positions`, `GET /organization/units` — **sem alteração** (continuam a ser servidos por `OrganizationService`, read-only).
  - `POST /departments`, `PUT /departments/:id`, `PATCH /departments/:id/(de)activate`, `POST /positions`, `PUT /positions/:id`, `DELETE /positions/:id`, `POST /units`, `PUT /units/:id`, `DELETE /units/:id` — comportamento preservado (só possivelmente **ampliado**, nunca reduzido).
- **`Department` tem `active: Boolean` E `status: DepartmentStatus` (ACTIVE|INACTIVE) — redundantes** (`prisma/schema.prisma:1042-1043`, `1032-1035`). Regra de reconciliação: `active` é a fonte de verdade; toda a escrita de `DepartmentsService` que muda `active` espelha `status` (`active ? 'ACTIVE' : 'INACTIVE'`), e vice-versa quando o DTO trouxer `status`. Nunca deixar os dois campos incoerentes numa linha escrita por este código.
- **`Department` tem `annualBudget: Float?` E `trainingBudget: Int?`** — ambos mantidos; `DepartmentsService` passa a aceitar os dois no DTO (hoje só aceita `trainingBudget`).
- **Comportamento a preservar de cada lado (o merge é a UNIÃO, não a intersecção):**
  - De `departments.service.ts`: `departmentHeadHistory` no create/update quando `headId` muda; `detectCircularHierarchy` (walk completo) no update; `deactivate`/`activate` soft; `UnitsService` auto-gera `code` (`UNI-00001`) quando não vem no DTO e liga `departmentId`.
  - De `organization.service.ts`: code de Department/Unit uniqueness **case-insensitive** + persistido em UPPERCASE; `createPosition` rejeita nome duplicado no mesmo `departmentId`; `headcountPlanned ?? 1`; `deleteDepartment` hard-delete com guardas (`_count.users === 0` e `_count.children === 0`); `deletePosition` hard-delete com guarda (`_count.users === 0`); `updatePosition` ignora `competencyIds` (não é coluna de `Position`); Department aceita `unitId`, `annualBudget`, `status`.
- **`RolesService` e `CareersService` (no mesmo ficheiro `departments.service.ts`) NÃO são tocados** — a consolidação de roles/permissões é a Fase D, separada.
- `prisma` é `@Global()` — `OrganizationModule` só precisa de adicionar `DepartmentsModule` a `imports`.
- `prettier`/`eslint`/`tsc` limpos antes de cada commit. `format:check` do CI corre só `prettier --check "src/**/*.ts"` — não correr prettier fora de `src/**`. Lint com `--config eslint.config.staged.mjs` quando preciso.
- Integração: lotes contra `postgresql://postgres:postgres@127.0.0.1:5432/innova_test`, `--runInBand`, Redis local a correr, `DB_POOL_MAX=5` em `.env.test`. `departments` e `organization` são lotes distintos. O teste `role.enum.spec.ts` "Grupo B" fixa o conjunto exacto de `@Roles` de `DepartmentsController` (memória "innova departments detail RBAC") — não alterar decoradores de rota nesta fase.

---

## File Structure

**Modificados:**
- `src/departments/departments.dto.ts` — `CreateDepartmentDto` += `unitId?`, `annualBudget?`, `status?`; `CreatePositionDto` += `headcountPlanned?` (e `code?` se ainda não existir); `CreateUnitDto` += `code?` (opcional — quando dado, é validado e usado em vez do auto-gerado).
- `src/departments/departments.service.ts`:
  - `DepartmentsService.create`/`update` — code case-insensitive + uppercase; aceitar `unitId`/`annualBudget`/`status`; espelhar `active`↔`status`.
  - `DepartmentsService.remove(id)` — **novo** método (hard-delete guardado), para o `DELETE /organization/departments/:id`.
  - `PositionsService.create` — dup-name-por-departamento + `headcountPlanned ?? 1`.
  - `PositionsService.update` — descartar `competencyIds` do payload.
  - `PositionsService.remove` — guarda `_count.users === 0`.
  - `UnitsService.create`/`update` — aceitar `code` explícito (case-insensitive dup-check + uppercase) mantendo o auto-gerador como fallback.
- `src/departments/departments.service.spec.ts`, `src/departments/departments.service.additional.spec.ts`, `src/departments/departments.service.errors.spec.ts` — novos casos para o comportamento absorvido.
- `src/organization/organization.module.ts` — `imports: [PrismaModule, DepartmentsModule]`.
- `src/organization/organization.service.ts` — os 8 métodos de escrita delegam; remover os corpos Prisma.
- `src/organization/organization.service.spec.ts`, `src/organization/organization.service.additional.spec.ts` — adaptar aos mocks dos serviços canónicos.
- `test/integration/departments/*.integration-spec.ts`, `test/integration/organization/*.integration-spec.ts` — testes que provam paridade entre `/departments` e `/organization/*` para escrita.
- `docs/arquitetura-modular-analise.md` — marcar Fase C concluída (§13) + item 4 de §5.

---

### Task 1: Estender `CreateDepartmentDto` + `DepartmentsService.create` (superset de campos e validação de código)

**Files:**
- Modify: `src/departments/departments.dto.ts`
- Modify: `src/departments/departments.service.ts` (`DepartmentsService.create`)
- Test: `src/departments/departments.service.spec.ts`

**Interfaces:**
- Produces: `DepartmentsService.create(dto)` passa a aceitar `unitId?: number`, `annualBudget?: number`, `status?: DepartmentStatus`. Código validado case-insensitively e persistido em UPPERCASE. `status` espelhado de/para `active`.

- [ ] **Step 1: Estender o DTO**

Em `src/departments/departments.dto.ts`, dentro de `CreateDepartmentDto`, adicionar (a seguir a `trainingBudget`):

```ts
  @IsOptional()
  @IsInt()
  unitId?: number;

  @IsOptional()
  @IsNumber()
  annualBudget?: number;

  @IsOptional()
  @IsEnum(DepartmentStatus)
  status?: DepartmentStatus;
```

Garantir os imports no topo do ficheiro: `IsNumber`, `IsEnum` de `class-validator`; `DepartmentStatus` de `@prisma/client`. (`UpdateDepartmentDto extends PartialType(CreateDepartmentDto)` herda automaticamente.)

- [ ] **Step 2: Escrever os testes (devem falhar)**

Em `src/departments/departments.service.spec.ts`, dentro do `describe('DepartmentsService', ...)` → `describe('create', ...)`:

```ts
    it('código é validado case-insensitively e persistido em UPPERCASE', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null); // dup-check
      mockPrisma.department.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));

      await service.create({ name: 'Eng', code: 'eng' } as any);

      // dup-check tem de usar mode insensitive
      expect(mockPrisma.department.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ code: expect.objectContaining({ mode: 'insensitive' }) }) }),
      );
      // create persiste UPPERCASE
      expect(mockPrisma.department.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'ENG' }) }),
      );
    });

    it('aceita unitId / annualBudget / status e espelha status↔active', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));

      await service.create({
        name: 'Ops', code: 'OPS', unitId: 4, annualBudget: 100000, status: 'INACTIVE',
      } as any);

      expect(mockPrisma.department.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitId: 4, annualBudget: 100000, status: 'INACTIVE', active: false }),
        }),
      );
    });

    it('sem status no DTO → active:true e status:ACTIVE', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));
      await service.create({ name: 'X', code: 'X' } as any);
      expect(mockPrisma.department.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ active: true, status: 'ACTIVE' }) }),
      );
    });
```

> Confirmar o nome do mock (`mockPrisma`) e a estrutura do `TestingModule` já usados neste ficheiro; ajustar os `expect` ao shape real.

- [ ] **Step 3: Correr e confirmar FAIL**

```bash
npx jest src/departments/departments.service.spec.ts -t "create"
```

- [ ] **Step 4: Implementar**

Em `DepartmentsService.create`, substituir a validação de código e o `data:` do `create`:

```ts
  async create(dto: CreateDepartmentDto) {
    const code = dto.code.toUpperCase();

    const codeExists = await this.prisma.department.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
    });
    if (codeExists) throw new ConflictException(`Código ${code} já existe`);

    if (dto.parentId) {
      const parent = await this.prisma.department.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Departamento pai não encontrado');
    }

    const active = dto.status ? dto.status === 'ACTIVE' : true;

    const dept = await this.prisma.department.create({
      data: {
        name: dto.name,
        code,
        description: dto.description,
        parentId: dto.parentId,
        headId: dto.headId,
        color: dto.color,
        icon: dto.icon,
        costCenter: dto.costCenter,
        trainingBudget: dto.trainingBudget,
        annualBudget: dto.annualBudget,
        unitId: dto.unitId,
        active,
        status: active ? 'ACTIVE' : 'INACTIVE',
      },
      include: {
        head: { select: { id: true, fullName: true } },
        parent: { select: { id: true, name: true, code: true } },
      },
    });

    if (dto.headId) {
      await this.prisma.departmentHeadHistory.create({
        data: { departmentId: dept.id, headId: dto.headId, startedAt: new Date() },
      });
    }

    return dept;
  }
```

- [ ] **Step 5: Correr e confirmar PASS (todo o ficheiro)**

```bash
npx jest src/departments/departments.service.spec.ts
```

- [ ] **Step 6: prettier + tsc**

```bash
npx prettier --write src/departments/
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/departments/departments.dto.ts src/departments/departments.service.ts src/departments/departments.service.spec.ts
git commit -m "feat(departments): create absorve unitId/annualBudget/status + código case-insensitive UPPERCASE"
```

---

### Task 2: `DepartmentsService.update` — superset (código case-insensitive, `active↔status`, campos extra)

**Files:**
- Modify: `src/departments/departments.service.ts` (`DepartmentsService.update`)
- Test: `src/departments/departments.service.spec.ts`

**Interfaces:**
- Produces: `DepartmentsService.update(id, dto)` aceita `unitId`/`annualBudget`/`status`; valida código novo case-insensitively; mantém `detectCircularHierarchy` e `departmentHeadHistory`; espelha `active↔status`.

- [ ] **Step 1: Escrever os testes (devem falhar)**

```ts
  describe('update', () => {
    it('novo código é validado case-insensitively contra outros e persistido UPPERCASE', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, code: 'ENG', parentId: null, headId: null, _count: { users: 0 } } as any);
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));

      await service.update(1, { code: 'ops' } as any);

      expect(mockPrisma.department.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            code: expect.objectContaining({ mode: 'insensitive' }),
            id: { not: 1 },
          }),
        }),
      );
      expect(mockPrisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'OPS' }) }),
      );
    });

    it('status no DTO → espelha active', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, code: 'ENG', parentId: null, headId: 5, _count: { users: 0 } } as any);
      mockPrisma.department.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));

      await service.update(1, { status: 'INACTIVE' } as any);

      expect(mockPrisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'INACTIVE', active: false }) }),
      );
    });

    it('parentId circular → BadRequestException (comportamento pré-existente preservado)', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, code: 'ENG', parentId: null, headId: null, _count: { users: 0 } } as any);
      jest.spyOn(service as any, 'detectCircularHierarchy').mockResolvedValue(true);
      await expect(service.update(1, { parentId: 2 } as any)).rejects.toThrow(BadRequestException);
    });
  });
```

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/departments/departments.service.spec.ts -t "update"
```

- [ ] **Step 3: Implementar**

Substituir `DepartmentsService.update`:

```ts
  async update(id: number, dto: UpdateDepartmentDto) {
    const existing = await this.findOne(id);

    const nextCode = dto.code ? dto.code.toUpperCase() : undefined;
    if (nextCode && nextCode !== existing.code) {
      const codeExists = await this.prisma.department.findFirst({
        where: { code: { equals: nextCode, mode: 'insensitive' }, id: { not: id } },
      });
      if (codeExists) throw new ConflictException(`Código ${nextCode} já em uso`);
    }

    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException('Departamento não pode ser pai de si próprio');
    }
    if (dto.parentId && dto.parentId !== existing.parentId) {
      const isCircular = await this.detectCircularHierarchy(id, dto.parentId);
      if (isCircular) throw new BadRequestException('Hierarquia circular detectada');
    }

    if (dto.headId && dto.headId !== existing.headId) {
      await this.prisma.departmentHeadHistory.updateMany({
        where: { departmentId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await this.prisma.departmentHeadHistory.create({
        data: { departmentId: id, headId: dto.headId, startedAt: new Date() },
      });
    }

    const { status, code: _code, ...rest } = dto;
    const data: Prisma.DepartmentUpdateInput = { ...rest };
    if (nextCode) data.code = nextCode;
    if (status !== undefined) {
      data.status = status;
      data.active = status === 'ACTIVE';
    }

    return this.prisma.department.update({
      where: { id },
      data,
      include: {
        head: { select: { id: true, fullName: true } },
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { users: true } },
      },
    });
  }
```

> Confirmar que `Prisma` está importado no ficheiro (`import { Prisma } from '@prisma/client'`). Se `findOne` não devolver `code`/`headId`/`parentId` no seu `select`, ajustar `findOne` para os incluir (já inclui `_count` — ver linha ~109).

- [ ] **Step 4: Correr e confirmar PASS (ficheiro todo)**

```bash
npx jest src/departments/departments.service.spec.ts
```

- [ ] **Step 5: prettier + tsc**

```bash
npx prettier --write src/departments/
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/departments/departments.service.ts src/departments/departments.service.spec.ts
git commit -m "feat(departments): update absorve status/campos extra + código case-insensitive; preserva head-history e anti-ciclo"
```

---

### Task 3: `DepartmentsService.remove` — hard-delete guardado (novo)

**Files:**
- Modify: `src/departments/departments.service.ts`
- Test: `src/departments/departments.service.errors.spec.ts` (ou `.spec.ts`)

**Interfaces:**
- Produces: `DepartmentsService.remove(id: number): Promise<{ message: string }>` — 404 se não existir; `BadRequestException` se `_count.users > 0` ou `_count.children > 0`; senão `prisma.department.delete` e `{ message: 'Departamento eliminado' }`. É o alvo do `DELETE /organization/departments/:id`.

- [ ] **Step 1: Escrever os testes (devem falhar)**

```ts
  describe('remove', () => {
    it('departamento inexistente → NotFoundException', async () => {
      mockPrisma.read.department.findUnique.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
    it('com colaboradores → BadRequestException', async () => {
      mockPrisma.read.department.findUnique.mockResolvedValue({ id: 1, _count: { users: 3, children: 0 } });
      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.department.delete).not.toHaveBeenCalled();
    });
    it('com sub-departamentos → BadRequestException', async () => {
      mockPrisma.read.department.findUnique.mockResolvedValue({ id: 1, _count: { users: 0, children: 2 } });
      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    });
    it('vazio → elimina e devolve mensagem', async () => {
      mockPrisma.read.department.findUnique.mockResolvedValue({ id: 1, _count: { users: 0, children: 0 } });
      mockPrisma.department.delete.mockResolvedValue({ id: 1 });
      expect(await service.remove(1)).toEqual({ message: 'Departamento eliminado' });
    });
  });
```

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/departments/departments.service.errors.spec.ts -t "remove"
```

- [ ] **Step 3: Implementar** (adicionar a `DepartmentsService`, junto a `deactivate`/`activate`)

```ts
  async remove(id: number) {
    const dept = await this.prisma.read.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true, children: true } } },
    });
    if (!dept) throw new NotFoundException('Departamento não encontrado');
    if (dept._count.users > 0) {
      throw new BadRequestException(
        `Departamento tem ${dept._count.users} colaboradores. Transfira-os primeiro.`,
      );
    }
    if (dept._count.children > 0) {
      throw new BadRequestException('Departamento tem sub-departamentos. Elimine-os primeiro.');
    }
    await this.prisma.department.delete({ where: { id } });
    return { message: 'Departamento eliminado' };
  }
```

- [ ] **Step 4: Correr e confirmar PASS**

```bash
npx jest src/departments/departments.service.errors.spec.ts
```

- [ ] **Step 5: prettier + tsc**

```bash
npx prettier --write src/departments/
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/departments/departments.service.ts src/departments/departments.service.errors.spec.ts
git commit -m "feat(departments): DepartmentsService.remove — hard-delete guardado (para DELETE /organization/departments/:id)"
```

---

### Task 4: `PositionsService` — dup-check por departamento, `headcountPlanned` default, `remove` guardado, `update` sem `competencyIds`

**Files:**
- Modify: `src/departments/departments.dto.ts` (`CreatePositionDto` += `headcountPlanned?`; confirmar `code?`)
- Modify: `src/departments/departments.service.ts` (`PositionsService`)
- Test: `src/departments/departments.service.spec.ts` ou `.additional.spec.ts`

**Interfaces:**
- Produces:
  - `PositionsService.create(dto)` — rejeita `ConflictException` se já existe posição com o mesmo `name` (case-insensitive) no mesmo `departmentId`; aplica `headcountPlanned ?? 1`.
  - `PositionsService.update(id, dto)` — descarta `competencyIds` do payload antes do `prisma.position.update`.
  - `PositionsService.remove(id)` — `BadRequestException` se `_count.users > 0`.

- [ ] **Step 1: Estender o DTO**

Em `CreatePositionDto` (`src/departments/departments.dto.ts`), garantir que existem:

```ts
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsInt()
  headcountPlanned?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  competencyIds?: number[];
```

(`competencyIds` é aceite mas ignorado na persistência — a associação real é via `PositionCompetency`, que exige `requiredLevel`; ver memória do módulo.)

- [ ] **Step 2: Escrever os testes (devem falhar)**

```ts
  describe('PositionsService', () => {
    it('create: nome duplicado no mesmo departamento → ConflictException', async () => {
      mockPrisma.position.findFirst.mockResolvedValue({ id: 9 });
      await expect(posService.create({ name: 'Analista', departmentId: 3 } as any)).rejects.toThrow(ConflictException);
    });

    it('create: headcountPlanned em falta → default 1', async () => {
      mockPrisma.position.findFirst.mockResolvedValue(null);
      mockPrisma.position.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));
      await posService.create({ name: 'Novo', departmentId: 3 } as any);
      expect(mockPrisma.position.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ headcountPlanned: 1 }) }),
      );
    });

    it('update: competencyIds é descartado do payload', async () => {
      jest.spyOn(posService, 'findOne').mockResolvedValue({ id: 1 } as any);
      mockPrisma.position.update.mockResolvedValue({ id: 1 });
      await posService.update(1, { name: 'X', competencyIds: [1, 2] } as any);
      const call = mockPrisma.position.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('competencyIds');
      expect(call.data).toEqual(expect.objectContaining({ name: 'X' }));
    });

    it('remove: posição com colaboradores → BadRequestException', async () => {
      mockPrisma.read.position.findUnique.mockResolvedValue({ id: 1, _count: { users: 2 } });
      await expect(posService.remove(1)).rejects.toThrow(BadRequestException);
    });
  });
```

> `posService` = `moduleRef.get(PositionsService)` no `beforeEach` da spec (adicionar se não existir). Confirmar mocks `mockPrisma.position.*` e `mockPrisma.read.position.*`.

- [ ] **Step 3: Correr e confirmar FAIL**

```bash
npx jest src/departments/departments.service.spec.ts -t "PositionsService"
```

- [ ] **Step 4: Implementar** (`PositionsService` em `src/departments/departments.service.ts`)

```ts
  async create(dto: CreatePositionDto) {
    const exists = await this.prisma.position.findFirst({
      where: {
        name: { equals: dto.name, mode: 'insensitive' },
        departmentId: dto.departmentId ?? undefined,
      },
    });
    if (exists) throw new ConflictException(`Posição "${dto.name}" já existe neste departamento`);

    const { competencyIds: _competencyIds, ...rest } = dto;
    return this.prisma.position.create({
      data: { ...rest, headcountPlanned: dto.headcountPlanned ?? 1 },
    });
  }

  async update(id: number, dto: UpdatePositionDto) {
    await this.findOne(id);
    const { competencyIds: _competencyIds, ...data } = dto;
    return this.prisma.position.update({ where: { id }, data });
  }

  async remove(id: number) {
    const pos = await this.prisma.read.position.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!pos) throw new NotFoundException('Posição não encontrada');
    if (pos._count.users > 0) {
      throw new BadRequestException(`Posição tem ${pos._count.users} colaboradores activos`);
    }
    await this.prisma.position.delete({ where: { id } });
    return { message: 'Posição eliminada' };
  }
```

> Nota: `remove` passa a devolver `{ message }` (antes devolvia o registo eliminado). Confirmar o teste de integração `DELETE /positions/:id` — se assertar a forma da resposta, ajustar (Task 8). O controller `PositionsController` (`departments.controller.ts:309`) só encaminha o retorno.

- [ ] **Step 5: Correr e confirmar PASS (ficheiro todo)**

```bash
npx jest src/departments/
```

- [ ] **Step 6: prettier + tsc**

```bash
npx prettier --write src/departments/
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/departments/departments.dto.ts src/departments/departments.service.ts src/departments/departments.service.spec.ts
git commit -m "feat(departments): PositionsService — dup-check por depto, headcountPlanned default, remove guardado, update sem competencyIds"
```

---

### Task 5: `UnitsService` — aceitar `code` explícito (case-insensitive + UPPERCASE) mantendo o auto-gerador

**Files:**
- Modify: `src/departments/departments.dto.ts` (`CreateUnitDto` += `code?`)
- Modify: `src/departments/departments.service.ts` (`UnitsService.create`/`update`)
- Test: `src/departments/departments.service.spec.ts` ou `.additional.spec.ts`

**Interfaces:**
- Produces: `UnitsService.create(dto)` — se `dto.code` vier, valida unicidade case-insensitive, persiste UPPERCASE; senão auto-gera (`UNI-00001`). `update` idem para `code`.

- [ ] **Step 1: DTO**

Em `CreateUnitDto`:

```ts
  @IsOptional()
  @IsString()
  code?: string;
```

- [ ] **Step 2: Testes (devem falhar)**

```ts
  describe('UnitsService', () => {
    it('create sem code → auto-gera UNI-xxxxx (comportamento pré-existente)', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue(null); // usado pelo generateCode e pelo dup-check
      mockPrisma.unit.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));
      await unitsService.create({ name: 'Sede', type: 'HQ' } as any);
      const call = mockPrisma.unit.create.mock.calls[0][0];
      expect(call.data.code).toMatch(/^UNI-\d{5}$/);
    });

    it('create com code explícito → valida case-insensitive e persiste UPPERCASE', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue(null);
      mockPrisma.unit.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));
      await unitsService.create({ name: 'Filial Norte', type: 'BRANCH', code: 'fn' } as any);
      expect(mockPrisma.unit.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'FN' }) }),
      );
    });

    it('create com code já existente (case-insensitive) → ConflictException', async () => {
      mockPrisma.unit.findFirst.mockResolvedValue({ id: 7, code: 'FN' });
      await expect(unitsService.create({ name: 'x', type: 'BRANCH', code: 'fn' } as any)).rejects.toThrow(ConflictException);
    });
  });
```

- [ ] **Step 3: Correr e confirmar FAIL**

```bash
npx jest src/departments/departments.service.spec.ts -t "UnitsService"
```

- [ ] **Step 4: Implementar** (`UnitsService`)

```ts
  async create(dto: CreateUnitDto) {
    const { departmentId, code: explicitCode, ...rest } = dto;

    let code: string;
    if (explicitCode) {
      code = explicitCode.toUpperCase();
      const exists = await this.prisma.unit.findFirst({
        where: { code: { equals: code, mode: 'insensitive' } },
      });
      if (exists) throw new ConflictException(`Código "${code}" já existe`);
    } else {
      code = await this.generateCode();
    }

    const unit = await this.prisma.unit.create({ data: { ...rest, code } });
    if (departmentId) {
      await this.prisma.department.update({ where: { id: departmentId }, data: { unitId: unit.id } });
    }
    return unit;
  }

  async update(id: number, dto: UpdateUnitDto) {
    await this.findOne(id);
    const { departmentId, code: explicitCode, ...rest } = dto;
    const data: Prisma.UnitUpdateInput = { ...rest };
    if (explicitCode) {
      const code = explicitCode.toUpperCase();
      const clash = await this.prisma.unit.findFirst({
        where: { code: { equals: code, mode: 'insensitive' }, id: { not: id } },
      });
      if (clash) throw new ConflictException(`Código "${code}" já existe`);
      data.code = code;
    }
    const unit = await this.prisma.unit.update({ where: { id }, data });
    if (departmentId) {
      await this.prisma.department.update({ where: { id: departmentId }, data: { unitId: id } });
    }
    return unit;
  }
```

- [ ] **Step 5: Correr e confirmar PASS (ficheiro todo)**

```bash
npx jest src/departments/
```

- [ ] **Step 6: prettier + tsc**

```bash
npx prettier --write src/departments/
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/departments/departments.dto.ts src/departments/departments.service.ts src/departments/departments.service.spec.ts
git commit -m "feat(departments): UnitsService aceita code explícito (case-insensitive UPPERCASE) mantendo auto-gerador"
```

---

### Task 6: `OrganizationModule` importa `DepartmentsModule`; `OrganizationService` injecta os 3 serviços

**Files:**
- Modify: `src/organization/organization.module.ts`
- Modify: `src/organization/organization.service.ts` (construtor)
- Test: `src/organization/organization.service.spec.ts`

**Interfaces:**
- Consumes: `DepartmentsService`, `PositionsService`, `UnitsService` (exportados por `DepartmentsModule`).

- [ ] **Step 1: Módulo**

`src/organization/organization.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DepartmentsModule } from '../departments/departments.module';

@Module({
  imports: [PrismaModule, DepartmentsModule],
  providers: [OrganizationService],
  controllers: [OrganizationController],
  exports: [OrganizationService],
})
export class OrganizationModule {}
```

- [ ] **Step 2: Construtor**

`src/organization/organization.service.ts`:

```ts
import { DepartmentsService, PositionsService, UnitsService } from '../departments/departments.service';

// ...
  constructor(
    private prisma: PrismaService,
    private readonly departments: DepartmentsService,
    private readonly positions: PositionsService,
    private readonly units: UnitsService,
  ) {}
```

- [ ] **Step 3: Adaptar o `TestingModule` da spec (deve falhar antes disto)**

Em `src/organization/organization.service.spec.ts` e `organization.service.additional.spec.ts`, adicionar aos `providers`:

```ts
import { DepartmentsService, PositionsService, UnitsService } from '../departments/departments.service';

const mockDepartments = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
const mockPositions = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
const mockUnits = { create: jest.fn(), update: jest.fn() };
// providers[]:
{ provide: DepartmentsService, useValue: mockDepartments },
{ provide: PositionsService, useValue: mockPositions },
{ provide: UnitsService, useValue: mockUnits },
```

- [ ] **Step 4: Correr — a spec compila e os testes existentes ainda passam**

```bash
npx jest src/organization/
```

Esperado: PASS (nada em `organization.service.ts` usa ainda os novos providers; se falhar por provider em falta, é porque outro spec do módulo também precisa do mock — adicionar lá também).

- [ ] **Step 5: prettier + tsc**

```bash
npx prettier --write src/organization/
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/organization/organization.module.ts src/organization/organization.service.ts src/organization/organization.service.spec.ts src/organization/organization.service.additional.spec.ts
git commit -m "refactor(organization): importar DepartmentsModule + injectar Departments/Positions/UnitsService"
```

---

### Task 7: `OrganizationService` — os 8 métodos de escrita delegam nos serviços canónicos

**Files:**
- Modify: `src/organization/organization.service.ts`
- Test: `src/organization/organization.service.spec.ts`, `src/organization/organization.service.additional.spec.ts`

**Interfaces:**
- Consumes: `departments.create/update/remove`, `positions.create/update/remove`, `units.create/update`.

- [ ] **Step 1: Reescrever os testes dos 8 métodos (devem falhar)**

Substituir, em `organization.service.spec.ts`, os `describe` de `createDepartment`/`updateDepartment`/`deleteDepartment`/`createPosition`/`updatePosition`/`deletePosition`/`createUnit`/`updateUnit` por testes de delegação. Exemplo (aplicar o mesmo padrão aos 8):

```ts
  describe('createDepartment', () => {
    it('delega em DepartmentsService.create com o DTO recebido', async () => {
      mockDepartments.create.mockResolvedValue({ id: 1, code: 'ENG' });
      const dto = { name: 'Eng', code: 'eng', unitId: 4, annualBudget: 1000, status: 'ACTIVE' } as any;
      const res = await service.createDepartment(dto);
      expect(mockDepartments.create).toHaveBeenCalledWith(dto);
      expect(res).toEqual({ id: 1, code: 'ENG' });
    });
  });

  describe('deleteDepartment', () => {
    it('delega em DepartmentsService.remove(id)', async () => {
      mockDepartments.remove.mockResolvedValue({ message: 'Departamento eliminado' });
      const res = await service.deleteDepartment(5);
      expect(mockDepartments.remove).toHaveBeenCalledWith(5);
      expect(res).toEqual({ message: 'Departamento eliminado' });
    });
  });

  describe('createPosition', () => {
    it('delega em PositionsService.create', async () => {
      mockPositions.create.mockResolvedValue({ id: 2 });
      const dto = { name: 'Analista', departmentId: 3, headcountPlanned: 2 } as any;
      await service.createPosition(dto);
      expect(mockPositions.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('createUnit', () => {
    it('delega em UnitsService.create', async () => {
      mockUnits.create.mockResolvedValue({ id: 3, code: 'FN' });
      const dto = { name: 'Filial Norte', type: 'BRANCH', code: 'fn' } as any;
      await service.createUnit(dto);
      expect(mockUnits.create).toHaveBeenCalledWith(dto);
    });
  });
```

Fazer o equivalente para `updateDepartment`/`updatePosition`/`deletePosition`/`updateUnit` (`toHaveBeenCalledWith(id, dto)`).

- [ ] **Step 2: Correr e confirmar FAIL**

```bash
npx jest src/organization/organization.service.spec.ts
```

- [ ] **Step 3: Implementar a delegação**

Em `src/organization/organization.service.ts`, substituir os corpos:

```ts
  async getDepartments(filters: OrganizationDepartmentFilterDto) { /* INALTERADO — leitura */ }
  async getDepartmentDetails(id: number) { /* INALTERADO — leitura */ }

  async createDepartment(dto: CreateOrgDepartmentDto) {
    return this.departments.create(dto);
  }

  async updateDepartment(id: number, dto: UpdateOrgDepartmentDto) {
    return this.departments.update(id, dto);
  }

  async deleteDepartment(id: number) {
    return this.departments.remove(id);
  }

  async getPositions(filters: PositionFilterDto) { /* INALTERADO — leitura */ }

  async createPosition(dto: CreateOrgPositionDto) {
    return this.positions.create(dto);
  }

  async updatePosition(id: number, dto: UpdateOrgPositionDto) {
    return this.positions.update(id, dto);
  }

  async deletePosition(id: number) {
    return this.positions.remove(id);
  }

  async getUnits() { /* INALTERADO — leitura */ }

  async createUnit(dto: CreateOrgUnitDto) {
    return this.units.create(dto);
  }

  async updateUnit(id: number, dto: UpdateOrgUnitDto) {
    return this.units.update(id, dto);
  }
```

Os DTOs `CreateOrgDepartmentDto`/etc. são estruturalmente compatíveis com `CreateDepartmentDto`/etc. estendidos na Task 1–5 (mesmos nomes de campo). Se o `tsc` reclamar de incompatibilidade nominal de tipos, aceitar os DTOs canónicos directamente no controller de `organization` **ou** fazer `return this.departments.create(dto as unknown as CreateDepartmentDto)` com um comentário — preferir a primeira via se não obrigar a mudar o contrato de validação exposto.

Remover imports agora sem uso (`Prisma`, `ConflictException`, etc. — verificar com eslint no Step 5). **Manter** os imports usados pelos métodos de leitura e de analytics que ficam.

- [ ] **Step 4: Correr e confirmar PASS**

```bash
npx jest src/organization/
```

- [ ] **Step 5: prettier + tsc + eslint**

```bash
npx prettier --write src/organization/
npx tsc --noEmit
npx eslint src/organization/organization.service.ts --config eslint.config.staged.mjs
```

- [ ] **Step 6: Commit**

```bash
git add src/organization/organization.service.ts src/organization/organization.service.spec.ts src/organization/organization.service.additional.spec.ts
git commit -m "refactor(organization): create/update/delete de Department/Position/Unit delegam em departments (elimina 2ª implementação)"
```

---

### Task 8: Testes de integração — paridade `/organization/*` ↔ `/departments|/positions|/units`

**Files:**
- Modify: `test/integration/organization/organization.integration-spec.ts`
- Modify: `test/integration/departments/*.integration-spec.ts` (se necessário ajustar assert de forma de resposta do `DELETE /positions/:id`)

- [ ] **Step 1: `organization` — escrita passa a respeitar as regras canónicas**

Adicionar um `describe('escrita consolidada (Fase C)')`:

```ts
it('POST /organization/departments com código minúsculo → persiste UPPERCASE e rejeita duplicado case-insensitive', async () => {
  const a = await request(app.getHttpServer())
    .post('/organization/departments')
    .set('Authorization', `Bearer ${rhToken}`)
    .send({ name: 'Dep Teste C', code: 'depc' })
    .expect(201);
  expect(a.body.code).toBe('DEPC');

  await request(app.getHttpServer())
    .post('/organization/departments')
    .set('Authorization', `Bearer ${rhToken}`)
    .send({ name: 'Outro', code: 'DEPC' })
    .expect(409);

  // cleanup
  await prisma.department.deleteMany({ where: { code: 'DEPC' } });
});

it('POST /organization/positions com nome já existente no mesmo departamento → 409 (antes: criava duplicado)', async () => {
  await request(app.getHttpServer())
    .post('/organization/positions')
    .set('Authorization', `Bearer ${rhToken}`)
    .send({ name: 'Cargo Dup C', departmentId: seededDeptId })
    .expect(201);
  await request(app.getHttpServer())
    .post('/organization/positions')
    .set('Authorization', `Bearer ${rhToken}`)
    .send({ name: 'Cargo Dup C', departmentId: seededDeptId })
    .expect(409);
  await prisma.position.deleteMany({ where: { name: 'Cargo Dup C' } });
});

it('DELETE /organization/departments/:id com colaboradores → 400 (guarda preservada)', async () => {
  await request(app.getHttpServer())
    .delete(`/organization/departments/${deptWithUsersId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(400);
});
```

> Adaptar `rhToken`/`adminToken`/`seededDeptId`/`deptWithUsersId` aos helpers/seed do ficheiro.

- [ ] **Step 2: `departments` — o teste existente de `DELETE /positions/:id` continua verde**

Correr o spec e, se assertar a forma da resposta (antes: registo eliminado; agora: `{ message: 'Posição eliminada' }`), ajustar o `expect` para `expect(res.body).toEqual({ message: 'Posição eliminada' })`. Se só verificar o status 200, não mexer.

- [ ] **Step 3: prettier**

```bash
npx prettier --write test/integration/organization/ test/integration/departments/
```

- [ ] **Step 4: Commit**

```bash
git add test/integration/
git commit -m "test(integration): paridade de escrita organization ↔ departments após consolidação"
```

---

### Task 9: Verificação completa + documento de arquitectura

**Files:**
- Modify: `docs/arquitetura-modular-analise.md`

- [ ] **Step 1: Unit dos 2 módulos**

```bash
npx jest src/departments src/organization
```

- [ ] **Step 2: Suite unitária completa**

```bash
npm test
```

- [ ] **Step 3: Integração — lotes `departments` e `organization` (Redis local a correr)**

```bash
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(departments)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(organization)/"
```

Prestar atenção a `role.enum.spec.ts` "Grupo B" (conjunto de `@Roles` de `DepartmentsController`) — tem de continuar verde sem alteração.

- [ ] **Step 4: prettier (`src/**`) + eslint**

```bash
npx prettier --check "src/**/*.ts"
npx eslint src/departments src/organization/organization.service.ts --config eslint.config.staged.mjs
```

- [ ] **Step 5: `tsc`**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Actualizar `docs/arquitetura-modular-analise.md`**

§13, linha da Fase C:

```
| C | Fundir `organization` em `departments` | 2 | Baixo (CRUD simples, sem lógica divergente encontrada) | Quick win de baixo risco, valida o padrão de fusão antes dos casos complexos |
```

→

```
| C | ~~Fundir `organization` em `departments`~~ — **concluída**: escrita de Department/Position/Unit tem agora uma só implementação (serviços canónicos de `departments`, estendidos para superconjunto); `OrganizationService` delega; rotas `/organization/*` intactas; leituras org-chart mantidas em `organization` (§4) | 2 | — | Ver `docs/superpowers/plans/2026-09-05-fase-c-organization-departments-merge.md` |
```

§5 item 4: acrescentar ` — **feito** (Fase C, 2026-09-05); nota: as leituras org-chart (`getDepartments`/`getDepartmentDetails`/`getPositions`/`getUnits`) ficaram em `organization` como projecção read-only tolerada.`

- [ ] **Step 7: Commit**

```bash
git add docs/arquitetura-modular-analise.md
git commit -m "docs: marcar Fase C (fusão organization/departments) como concluída"
```

---

### Task 10: PR e CI

- [ ] **Step 1: Branch + push**

```bash
git push -u origin <branch>:refactor/organization-departments-merge
```

- [ ] **Step 2: PR**

```bash
gh pr create --base main --title "refactor(org): fundir escrita de organization em departments (Fase C)" --body "$(cat <<'EOF'
## Resumo
Fase C do roteiro (`docs/arquitetura-modular-analise.md` §13 / §2.3 item 11). `organization` tinha uma 2ª implementação completa de CRUD de `Department`/`Position`/`Unit`, sobre as mesmas tabelas, sem importar `DepartmentsModule` — validações divergiam (código case-insensitive vs exacto, hard-delete vs soft, campos diferentes na mesma tabela).

## Mudanças
- Serviços canónicos (`DepartmentsService`/`PositionsService`/`UnitsService`) estendidos para superconjunto: absorvem `unitId`/`annualBudget`/`status` no Department, código case-insensitive + UPPERCASE, dup-check de posição por departamento, `headcountPlanned` default, `DepartmentsService.remove`/`PositionsService.remove` hard-delete guardado. Comportamento pré-existente (head-history, anti-ciclo, soft deactivate, auto-código de Unit) preservado.
- `OrganizationService.create/update/delete*` delegam nos serviços canónicos; corpos Prisma removidos.
- `Department.active` ↔ `Department.status` mantidos coerentes em toda a escrita (campos redundantes no schema).
- **Sem alteração de rotas.** Leituras org-chart (`GET /organization/departments|positions|units`) permanecem em `organization` como projecção read-only (§4).

## Testes
- Unit: casos novos em `departments.service.*.spec.ts` (superset) + specs de `organization` reescritas para delegação.
- Integração: paridade de escrita `/organization/*` ↔ `/departments|/positions`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Aguardar `quality` verde.**
- [ ] **Step 4: `gh pr merge --squash --auto`.**

---

## Self-Review

**1. Cobertura da spec (§2.3 item 11 + §5 item 4 + §13 fase C):**
- "Fundir `organization` em `departments`" (escrita) → Tasks 6–7 (delegação). ✔
- "validações podem divergir" (§2.3) → Tasks 1–5 fazem os serviços canónicos absorverem a UNIÃO das validações. ✔
- "`organization` não importa `DepartmentsModule` — bypass total" (§2.3) → Task 6 (import + injecção). ✔
- §5 item 4 "`DepartmentsService` público consumido por `organization`" → Task 7. ✔
- Não coberto por escolha explícita: as leituras (`getDepartments` etc.) ficam em `organization` — anotado nas Global Constraints e no §5 do doc; são read-only e shape-específicas do org-chart, excepção tolerada por §4. Se o revisor quiser também consolidar as leituras, é uma fase-follow-up separada.

**2. Placeholders:** os `/* INALTERADO — leitura */` na Task 7 Step 3 referem-se a métodos que já existem e não são tocados — não é placeholder, é instrução de "não mexer". Todo o código novo está escrito. ✔

**3. Consistência de tipos:**
- `DepartmentsService.create(dto)`, `.update(id, dto)`, `.remove(id) → { message }`; `PositionsService.create/update/remove(id) → { message }`; `UnitsService.create/update`. Usados com estas assinaturas na Task 7. ✔
- `remove` (Department e Position) passou a devolver `{ message }` — Task 8 Step 2 verifica o impacto no teste de integração de `DELETE /positions/:id`. ✔
- DTO `status?: DepartmentStatus` (enum `ACTIVE|INACTIVE`) usado em Tasks 1, 2, 7. `active` derivado consistentemente (`status === 'ACTIVE'`). ✔

**4. Riscos anotados:** incompatibilidade nominal `CreateOrgDepartmentDto` vs `CreateDepartmentDto` (Task 7 Step 3 dá 2 saídas); `role.enum.spec.ts` Grupo B (Task 9 Step 3 — não tocar decoradores); forma de resposta de `remove` (Task 8). Sem ciclo de módulos (verificado na Architecture).
