# Fase B — Consolidar `attendance` sobre `leave-management` — Plano de Implementação

> **Para agentes de execução:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objectivo:** `attendance` deixa de escrever `LeaveRequest`/`LeaveBalance` directamente por Prisma e passa a delegar sempre em `LeaveManagementService` — elimina a divergência de saldo de férias/licenças entre os dois ecrãs (`/attendance/leaves*` vs `/leave*`) identificada em `docs/arquitetura-modular-analise.md` §2.3 item 3.

**Arquitectura:** `AttendanceModule` importa `LeaveManagementModule` (já exporta `LeaveManagementService`). `AttendanceService.createLeaveRequest`/`reviewLeave`/`getLeaveBalance` passam a chamar métodos públicos de `LeaveManagementService` em vez de `this.prisma.leaveRequest`/`leaveBalance` directamente. Um pequeno mapa de tradução (`LeaveType` do Prisma → `LeaveTypeConfig.code`) resolve a divergência de nomenclatura entre os dois módulos. A resposta HTTP dos 3 endpoints afectados (`POST /attendance/leaves`, `PATCH /attendance/leaves/:id/review`, `GET /attendance/my/leave-balance`, `GET /attendance/leaves/balance/:userId`) mantém a mesma forma que o frontend já consome — nenhuma rota muda, nenhum campo existente desaparece.

**Tech Stack:** NestJS, Prisma, Jest (unit + integration com Postgres real via `test/jest-integration.json`), `class-validator`.

**Spec:** `docs/arquitetura-modular-analise.md` (secções 2.3 item 3, 2.5, 4, 13 — Fase B) e `docs/arquitetura-modular.md` (documento-fonte).

## Global Constraints

- **Não alterar o visual/contrato de resposta do frontend** (`docs/arquitetura-modular.md` §12) — os 4 endpoints afectados mantêm rota, verbo e forma de resposta idênticas às actuais.
- **Decisão de autorização confirmada pelo utilizador (2026-09-04):** só o aprovador atribuído (gestor directo, ou RH se a política tiver 2 níveis) pode aprovar/rejeitar via `PATCH /attendance/leaves/:id/review` — **não** adicionar bypass de ADMIN/RH em `LeaveManagementService.processApproval`. O teste existente `test/integration/leave-management/leave-management.integration-spec.ts:275-281` (`'outro utilizador sem aprovação pendente não pode aprovar → 403'`, usa `adminToken`) fica sem alteração e continua a passar.
- **Multi-tenancy:** confirmado single-tenant (`docs/arquitetura-modular-analise.md` §7) — nenhuma tarefa deste plano toca em `tenantId`.
- `LeaveStatus` do Prisma (`@prisma/client`, re-exportado por `attendance.dto.ts`) e o `LeaveStatus` local de `leave-management.dto.ts` têm exactamente os mesmos 6 valores (`DRAFT, PENDING, APPROVED, REJECTED, CANCELLED, EXPIRED`) — confirmado em `prisma/schema.prisma:187-194`. São tipos TS diferentes; não comparar directamente um com o outro sem converter primeiro (usar o `ApprovalAction` de `leave-management.dto.ts` como alvo da tradução).
- `prettier`/`eslint`/`tsc` têm de ficar limpos antes de qualquer commit — usar `npx prettier --write <ficheiros>` e `npm run lint` com `--config eslint.config.staged.mjs` se necessário (per `CLAUDE.md`).
- Toda a suite de integração corre em lotes (`node scripts/run-integration-batched.js`) contra o mesmo Postgres partilhado (`postgresql://postgres:postgres@127.0.0.1:5432/innova_test`) — `attendance` é o **Lote 1**, `leave-management` é o **Lote 5**. `globalSetup` (`test/integration/setup.ts`) corre uma vez por lote (processo `jest` novo por lote), por isso qualquer seed adicionado ali fica garantidamente disponível antes do Lote 1.

---

### Task 1: Seed de produção — completar o catálogo `LeaveTypeConfig`

**Files:**
- Modify: `prisma/seed.ts:253-338` (array `leaveTypes` e o loop de upsert)

**Interfaces:**
- Produces: 3 novas linhas em `LeaveTypeConfig` com `code` = `JUSTIFIED_ABSENCE`, `UNJUSTIFIED_ABSENCE`, `PUBLIC_DUTY` — necessárias porque o enum `LeaveType` do Prisma (`prisma/schema.prisma:174-185`) tem 10 valores mas o seed actual só cobre 8 códigos (`VACATION, SICK, MATERNITY, PATERNITY, BEREAVEMENT, TRAINING, UNPAID, OTHER`), faltando exactamente os 3 que `attendance` vai passar a precisar via `LeaveManagementService.create()`.

- [x] **Step 1: Adicionar as 3 entradas em falta ao array `leaveTypes`**

Em `prisma/seed.ts`, dentro do array `leaveTypes` (a seguir à entrada `BEREAVEMENT`, antes de `TRAINING`, para manter a ordem lógica estatutário→médico→família→formação→outros), adicionar:

```ts
    {
      code: 'JUSTIFIED_ABSENCE',
      name: 'Ausência Justificada',
      description: 'Ausência justificada não coberta por outro tipo (ex: consulta médica, assuntos pessoais pontuais)',
      category: 'OTHER',
      color: '#0EA5E9',
      icon: 'FileCheck',
      isPaid: true,
      annualLimit: 6,
      minNoticeDays: 0,
    },
    {
      code: 'UNJUSTIFIED_ABSENCE',
      name: 'Ausência Injustificada',
      description: 'Ausência registada sem justificação — impacto disciplinar/salarial a tratar caso a caso',
      category: 'DISCIPLINARY',
      color: '#DC2626',
      icon: 'AlertTriangle',
      isPaid: false,
      minNoticeDays: 0,
    },
    {
      code: 'PUBLIC_DUTY',
      name: 'Dever Cívico',
      description: 'Convocatória oficial (júri, eleições, testemunho em tribunal, serviço militar)',
      category: 'OTHER',
      color: '#7C3AED',
      icon: 'Landmark',
      isPaid: true,
      minNoticeDays: 3,
    },
```

- [x] **Step 2: Confirmar visualmente a ordem final do array e o log de confirmação**

O `console.log('✅ Tipos de licença criados:', leaveTypes.map(l => l.code).join(', '));` já existente (linha ~340) não precisa de alteração — vai passar a listar 11 códigos automaticamente porque itera o array.

- [x] **Step 3: Formatar e verificar TypeScript**

```bash
npx prettier --write prisma/seed.ts
npx tsc --noEmit
```

Nota: `tsc --noEmit` não cobre `test/**` (ver `CLAUDE.md`), mas cobre `prisma/seed.ts`.

- [x] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(leave): adicionar JUSTIFIED_ABSENCE/UNJUSTIFIED_ABSENCE/PUBLIC_DUTY ao catálogo de tipos de licença"
```

---

### Task 2: Seed da BD de testes de integração — catálogo completo + saldo inicial

**Files:**
- Modify: `test/integration/setup.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces: 10 linhas `LeaveTypeConfig` (todas as que `ATTENDANCE_LEAVE_TYPE_TO_CODE`, definido na Task 5, vai referenciar) + `LeaveBalance` inicial para `int.employee` nos 6 códigos legados (`VACATION, SICK, MATERNITY, PATERNITY, BEREAVEMENT, JUSTIFIED_ABSENCE`), disponíveis para o **Lote 1** (`attendance`) — que corre *antes* do Lote 5 (`leave-management`), e cujo `globalSetup` próprio não semeia nada disto hoje.

**Porquê isto é necessário (não opcional):** `LeaveManagementService.create()` (chamado por `attendance.createLeaveRequest` a partir da Task 6) exige `LeaveTypeConfig.findUnique({ code })` a existir, senão lança `NotFoundException`. E `runValidations()` verifica saldo disponível (`this.prisma.read.leaveBalance.findUnique(...)`, default `0` se não existir) sempre que `leaveType.annualLimit` está definido — sem uma `LeaveBalance` inicial, `int.employee` nunca conseguiria pedir `VACATION` (que tem `annualLimit`), e o teste já existente `POST /attendance/leaves` (`test/integration/attendance/attendance.integration-spec.ts:116-134`, espera `[201, 409]`) passaria a receber `400`.

- [x] **Step 1: Escrever o bloco de seed de tipos de licença**

Em `test/integration/setup.ts`, depois do bloco `// Course — ...` e antes de `await prisma.$disconnect();`, adicionar:

```ts
  // Leave types — necessário para o Lote 1 (attendance), que corre antes do
  // Lote 5 (leave-management) e delega em LeaveManagementService.create()
  // desde a consolidação Fase B (docs/arquitetura-modular-analise.md §13).
  // `update` força reset a cada corrida do globalSetup (uma vez por lote) —
  // sem isto, uma BD de teste reutilizada entre execuções ia acumular saldo
  // gasto de corridas anteriores até ficar insuficiente (flakiness).
  const leaveTypesForTests: {
    code: string;
    name: string;
    category: string;
    isPaid: boolean;
    annualLimit?: number;
    countWorkDaysOnly: boolean;
  }[] = [
    { code: 'VACATION', name: 'Férias', category: 'STATUTORY', isPaid: true, annualLimit: 22, countWorkDaysOnly: true },
    { code: 'SICK', name: 'Baixa Médica', category: 'MEDICAL', isPaid: true, countWorkDaysOnly: true },
    { code: 'MATERNITY', name: 'Licença de Maternidade', category: 'FAMILY', isPaid: true, annualLimit: 120, countWorkDaysOnly: true },
    { code: 'PATERNITY', name: 'Licença de Paternidade', category: 'FAMILY', isPaid: true, annualLimit: 28, countWorkDaysOnly: true },
    { code: 'BEREAVEMENT', name: 'Luto', category: 'FAMILY', isPaid: true, annualLimit: 5, countWorkDaysOnly: true },
    { code: 'TRAINING', name: 'Formação', category: 'TRAINING', isPaid: true, countWorkDaysOnly: true },
    { code: 'JUSTIFIED_ABSENCE', name: 'Ausência Justificada', category: 'OTHER', isPaid: true, annualLimit: 6, countWorkDaysOnly: true },
    { code: 'UNJUSTIFIED_ABSENCE', name: 'Ausência Injustificada', category: 'DISCIPLINARY', isPaid: false, countWorkDaysOnly: true },
    { code: 'PUBLIC_DUTY', name: 'Dever Cívico', category: 'OTHER', isPaid: true, countWorkDaysOnly: true },
    { code: 'OTHER', name: 'Outra', category: 'OTHER', isPaid: false, countWorkDaysOnly: true },
  ];

  for (const lt of leaveTypesForTests) {
    await prisma.leaveTypeConfig.upsert({
      where: { code: lt.code },
      update: { name: lt.name, category: lt.category, isPaid: lt.isPaid, annualLimit: lt.annualLimit ?? null, active: true },
      create: { ...lt, active: true },
    });
  }

  // Saldo inicial de int.employee para os tipos com annualLimit — simula um
  // colaborador já onboardado (LeaveManagementService.initializeUserBalances
  // faria o mesmo). `update` reposiciona ao valor cheio a cada lote, para os
  // testes do Lote 1 (attendance) partirem sempre do mesmo estado.
  const employeeForBalances = await prisma.user.findUnique({
    where: { email: 'int.employee@innova-test.com' },
  });
  if (employeeForBalances) {
    for (const lt of leaveTypesForTests) {
      if (!lt.annualLimit) continue;
      await prisma.leaveBalance.upsert({
        where: {
          userId_leaveTypeCode: { userId: employeeForBalances.id, leaveTypeCode: lt.code },
        },
        update: { balance: lt.annualLimit, used: 0 },
        create: {
          userId: employeeForBalances.id,
          leaveTypeCode: lt.code,
          balance: lt.annualLimit,
          used: 0,
        },
      });
    }
  }
```

- [x] **Step 2: Formatar**

```bash
npx prettier --write test/integration/setup.ts
```

- [x] **Step 3: Commit**

```bash
git add test/integration/setup.ts
git commit -m "test(integration): semear catálogo completo de LeaveTypeConfig + saldo inicial de int.employee"
```

(Sem verificação isolada aqui — este ficheiro só se prova a funcionar quando o Lote 1 correr, na Task 10.)

---

### Task 3: Corrigir `LeaveManagementService` — auto-aprovação sem aprovador não deduzia saldo

**Files:**
- Modify: `src/leave-management/leave-management.service.ts`
- Test: `src/leave-management/leave-management.service.spec.ts`

**Interfaces:**
- Produces: método privado `finalizeApproval(request: { id: number; userId: number; leaveTypeCode: string; workDays: number }, actorId: number): Promise<void>` — chamado tanto pelo ramo "todos os níveis aprovaram" de `processApproval` como pelo ramo "sem aprovador configurado" de `createApprovalFlow`. `createApprovalFlow` passa a receber o `LeaveRequest` completo (não só `requestId`+`userId`) para poder chamar `finalizeApproval` com `leaveTypeCode`/`workDays`.

**Bug concreto (achado durante a investigação deste plano, não estava na análise original):** quando um pedido de licença não tem gestor atribuído (`user.managerId` nulo) e a política não exige 2 níveis, `createApprovalFlow` marca o pedido como `APPROVED` directamente (linhas 963-969 do ficheiro actual) **sem chamar `deductBalance`, `applyModuleImpacts`, `notifyUser` nem `audit.log`** — ao contrário do ramo equivalente em `processApproval` (linhas 448-464). Isto é especialmente grave porque, neste dataset, **nenhum utilizador tem `managerId` definido** (ver `docs/superpowers/plans/../../MEMORY` / nota de projecto "no dev-DB user has managerId") — ou seja, este é o caminho **mais comum**, não um caso raro.

- [x] **Step 1: Escrever o teste que expõe o bug (deve falhar)**

Em `src/leave-management/leave-management.service.spec.ts`, primeiro estender o mock scaffolding (é necessário para o teste correr sem `TypeError`, independentemente do resultado esperado): adicionar `findUnique` ao objecto `leaveBalance` mock, e um novo objecto `leaveBalanceHistory` ao proxy.

```ts
// no objecto `leaveBalance` (topo do ficheiro), adicionar a chave que falta:
const leaveBalance = {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  upsert: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
};

// novo objecto, junto aos outros mocks de topo de ficheiro:
const leaveBalanceHistory = {
  create: jest.fn().mockResolvedValue({}),
};

// no `mockPrismaProxy` (Proxy get trap), adicionar mais um `if`:
    if (prop === 'leaveBalanceHistory') return leaveBalanceHistory;
```

Depois, dentro do `describe('create', ...)` já existente (logo a seguir ao teste `'deve criar pedido de licença'`), adicionar:

```ts
    it('sem gestor atribuído e sem política de 2 níveis → aprova automaticamente E deduz saldo (bug: hoje só aprova, não deduz)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Test User',
        email: 'test@innova.com',
        managerId: null,
      });
      leaveTypeConfig.findUnique.mockResolvedValue({
        code: 'VACATION',
        name: 'Férias',
        annualLimit: 22,
        countWorkDaysOnly: true,
        autoApprove: false,
        requiresDocument: false,
      });
      leaveBalance.findUnique.mockResolvedValue({ balance: 22, used: 0, userId: 1, leaveTypeCode: 'VACATION' });
      leaveBalance.findFirst.mockResolvedValue({ balance: 22, userId: 1, leaveTypeCode: 'VACATION' });
      leavePolicy.findFirst.mockResolvedValue(null);
      mockPrisma.leaveRequest.create.mockResolvedValue({
        ...baseLeaveRequest,
        id: 42,
        leaveTypeCode: 'VACATION',
        workDays: 3,
        status: 'PENDING',
      });

      await service.create(
        {
          leaveTypeCode: 'VACATION',
          startDate: '2024-08-01',
          endDate: '2024-08-05',
          reason: 'Férias sem gestor',
        } as any,
        1,
      );

      expect(leaveBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_leaveTypeCode: { userId: 1, leaveTypeCode: 'VACATION' } },
        }),
      );
      expect(leaveBalanceHistory.create).toHaveBeenCalled();
    });
```

- [x] **Step 2: Correr o teste e confirmar que falha**

```bash
npx jest src/leave-management/leave-management.service.spec.ts -t "sem gestor atribuído"
```

Esperado: `FAIL` — `leaveBalance.upsert` não foi chamado (o código actual só faz `leaveRequest.update({ status: APPROVED })` neste ramo).

- [x] **Step 3: Extrair `finalizeApproval` e usar nos dois ramos**

Em `src/leave-management/leave-management.service.ts`, dentro de `processApproval`, substituir o bloco:

```ts
    if (remainingApprovals === 0) {
      // Todos os níveis aprovaram
      await this.prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: LeaveStatus.APPROVED, finalApprovedAt: new Date() },
      });

      await this.deductBalance(request.userId, request.leaveTypeCode, request.workDays, requestId);
      await this.applyModuleImpacts(request);
      await this.notifyUser(request.userId, 'LEAVE_APPROVED', `O seu pedido foi aprovado!`);
      await this.audit.log({
        action: 'LEAVE_APPROVED',
        entityType: 'LeaveRequest',
        entityId: requestId,
        userId: approverId,
      });
    }
```

por:

```ts
    if (remainingApprovals === 0) {
      // Todos os níveis aprovaram
      await this.finalizeApproval(request, approverId);
    }
```

Adicionar `finalApprovedAt: new Date()` dentro de `finalizeApproval` (ver abaixo — mantém o campo que o bloco original definia).

Substituir a assinatura e corpo de `createApprovalFlow`:

```ts
  private async createApprovalFlow(
    requestId: number,
    userId: number,
    policy: Prisma.LeavePolicyGetPayload<object> | null,
  ) {
```

por:

```ts
  private async createApprovalFlow(
    request: { id: number; userId: number; leaveTypeCode: string; workDays: number },
    policy: Prisma.LeavePolicyGetPayload<object> | null,
  ) {
    const requestId = request.id;
    const userId = request.userId;
```

(mantém o resto do corpo de `createApprovalFlow` inalterado até chegar ao ramo `if (approvals.length === 0)`), e trocar:

```ts
    if (approvals.length === 0) {
      // Sem gestor configurado — auto-aprovar
      await this.prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: LeaveStatus.APPROVED },
      });
    } else {
```

por:

```ts
    if (approvals.length === 0) {
      // Sem gestor configurado — auto-aprovar. `actorId = userId` porque não
      // existe aprovador humano que tenha tomado a decisão — quem accionou
      // este caminho foi o próprio requerente ao submeter o pedido.
      await this.finalizeApproval(request, userId);
    } else {
```

Actualizar o único call site de `createApprovalFlow` dentro de `create()`:

```ts
    if (initialStatus === LeaveStatus.PENDING) {
      const policy = await this.getApplicablePolicy(dto.userId);
      await this.createApprovalFlow(request.id, dto.userId, policy);
    }
```

por:

```ts
    if (initialStatus === LeaveStatus.PENDING) {
      const policy = await this.getApplicablePolicy(dto.userId);
      await this.createApprovalFlow(request, policy);
    }
```

Adicionar o novo método privado `finalizeApproval` (junto aos outros helpers privados, por exemplo antes de `deductBalance`):

```ts
  /**
   * Marca o pedido como aprovado e aplica todos os efeitos secundários de uma
   * aprovação final — dedução de saldo, impacto noutros módulos, notificação
   * e auditoria. Chamado tanto quando o último nível de aprovação decide
   * APPROVE (processApproval) como quando não existe nenhum aprovador
   * configurado e o pedido é auto-aprovado na submissão (createApprovalFlow).
   * Extraído para eliminar a divergência onde o segundo caminho fazia só o
   * update de status, sem tocar no ledger de saldo (bug real, corrigido aqui).
   */
  private async finalizeApproval(
    request: { id: number; userId: number; leaveTypeCode: string; workDays: number },
    actorId: number,
  ) {
    await this.prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status: LeaveStatus.APPROVED, finalApprovedAt: new Date() },
    });

    await this.deductBalance(request.userId, request.leaveTypeCode, request.workDays, request.id);
    await this.applyModuleImpacts(request as Prisma.LeaveRequestGetPayload<object>);
    await this.notifyUser(request.userId, 'LEAVE_APPROVED', 'O seu pedido foi aprovado!');
    await this.audit.log({
      action: 'LEAVE_APPROVED',
      entityType: 'LeaveRequest',
      entityId: request.id,
      userId: actorId,
    });
  }
```

`applyModuleImpacts`/`reverseModuleImpacts` só usam `request.userId` e `request.id` no corpo actual — o tipo declarado (`Prisma.LeaveRequestGetPayload<object>`) é mais amplo do que o necessário; o cast `as Prisma.LeaveRequestGetPayload<object>` no passo acima evita alargar a assinatura pública desses dois métodos nesta tarefa (mantém o escopo pequeno). Se o `tsc` recusar o cast por incompatibilidade estrutural, alargar em alternativa o parâmetro de `applyModuleImpacts`/`reverseModuleImpacts` para `Pick<Prisma.LeaveRequestGetPayload<object>, 'id' | 'userId'>`.

- [x] **Step 4: Correr o teste novamente e confirmar que passa**

```bash
npx jest src/leave-management/leave-management.service.spec.ts
```

Esperado: `PASS` em todos os testes do ficheiro, incluindo o novo e o `'deve criar pedido de licença'` já existente (que agora também passa a exercitar `finalizeApproval` por baixo, dado que o mock de `user.findUnique` nesse teste não define `managerId`).

- [x] **Step 5: Formatar e verificar tipos**

```bash
npx prettier --write src/leave-management/leave-management.service.ts src/leave-management/leave-management.service.spec.ts
npx tsc --noEmit
```

- [x] **Step 6: Commit**

```bash
git add src/leave-management/leave-management.service.ts src/leave-management/leave-management.service.spec.ts
git commit -m "fix(leave-management): auto-aprovação sem gestor atribuído passa a deduzir saldo e notificar (bug: só marcava status)"
```

---

### Task 4: `AttendanceModule` importa `LeaveManagementModule`

**Files:**
- Modify: `src/attendance/attendance.module.ts`

**Interfaces:**
- Consumes: `LeaveManagementModule` (já existe, já exporta `LeaveManagementService` — `src/leave-management/leave-management.module.ts:9-15`).

- [x] **Step 1: Adicionar o import**

```ts
// src/attendance/attendance.module.ts
import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';
import { LeaveManagementModule } from '../leave-management/leave-management.module';

@Module({
  imports: [PrismaModule, AuditModule, LeaveManagementModule],
  providers: [AttendanceService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}
```

- [x] **Step 2: Verificar que a app ainda arranca (detecta ciclo de módulos, se houver)**

```bash
npx tsc --noEmit -p .
```

(`LeaveManagementModule` só importa `PrismaModule`+`AuditModule`, nenhum dos quais importa `AttendanceModule` — não há ciclo, confirmado na análise §4 do documento de arquitectura.)

- [x] **Step 3: Commit**

```bash
git add src/attendance/attendance.module.ts
git commit -m "refactor(attendance): importar LeaveManagementModule (preparação Fase B)"
```

---

### Task 5: `AttendanceService` — injectar `LeaveManagementService` + mapa de tradução de tipos

**Files:**
- Modify: `src/attendance/attendance.service.ts`
- Test: `src/attendance/attendance.service.spec.ts`

**Interfaces:**
- Produces: `AttendanceService.LEAVE_TYPE_TO_CODE: Record<LeaveType, string>` (propriedade estática privada) — traduz o enum `LeaveType` do Prisma (usado por `CreateLeaveRequestDto.type`, o contrato público que o frontend já usa) para `LeaveTypeConfig.code` (a chave real usada por `leave-management`, ver Task 1/2). Consumido pelas Tasks 6 e 9.
- Consumes: `LeaveManagementService` (Task 4).

- [x] **Step 1: Adicionar o import e o construtor**

Em `src/attendance/attendance.service.ts`, adicionar ao topo:

```ts
import { LeaveManagementService } from '../leave-management/leave-management.service';
import { ApprovalAction, DurationMode } from '../leave-management/leave-management.dto';
```

E no construtor da classe:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly leaveManagement: LeaveManagementService,
  ) {}
```

- [x] **Step 2: Adicionar o mapa de tradução**

Logo antes da classe `AttendanceService` (ao lado das outras funções auxiliares de topo de ficheiro), ou como propriedade estática privada dentro da classe — usar propriedade estática privada para ficar junto da classe que a usa:

```ts
  // Traduz o enum LeaveType (Prisma, usado por CreateLeaveRequestDto.type —
  // contrato público já consumido pelo frontend) para LeaveTypeConfig.code
  // (chave real do catálogo configurável de leave-management). SICK_LEAVE→
  // 'SICK' é o único par que diverge de uma correspondência 1:1 nome-a-nome
  // (ver docs/superpowers/plans/2026-09-04-fase-b-attendance-leave-consolidation.md
  // Task 1) — os restantes 9 usam o próprio nome do enum como código.
  private static readonly LEAVE_TYPE_TO_CODE: Record<LeaveType, string> = {
    [LeaveType.VACATION]: 'VACATION',
    [LeaveType.SICK_LEAVE]: 'SICK',
    [LeaveType.MATERNITY]: 'MATERNITY',
    [LeaveType.PATERNITY]: 'PATERNITY',
    [LeaveType.JUSTIFIED_ABSENCE]: 'JUSTIFIED_ABSENCE',
    [LeaveType.UNJUSTIFIED_ABSENCE]: 'UNJUSTIFIED_ABSENCE',
    [LeaveType.BEREAVEMENT]: 'BEREAVEMENT',
    [LeaveType.TRAINING]: 'TRAINING',
    [LeaveType.PUBLIC_DUTY]: 'PUBLIC_DUTY',
    [LeaveType.OTHER]: 'OTHER',
  };

  // 6 tipos legados que attendance.getLeaveBalance() sempre expôs (entitlements
  // hardcoded antes desta consolidação) — mantidos como o conjunto exposto por
  // GET /attendance/my/leave-balance e /attendance/leaves/balance/:userId para
  // não alterar a forma da resposta que o frontend já consome.
  private static readonly LEGACY_BALANCE_TYPES: LeaveType[] = [
    LeaveType.VACATION,
    LeaveType.SICK_LEAVE,
    LeaveType.MATERNITY,
    LeaveType.PATERNITY,
    LeaveType.BEREAVEMENT,
    LeaveType.JUSTIFIED_ABSENCE,
  ];
```

- [x] **Step 2: Adaptar o `TestingModule` do spec para fornecer o novo provider**

Em `src/attendance/attendance.service.spec.ts`, adicionar:

```ts
import { LeaveManagementService } from '../leave-management/leave-management.service';
```

E um mock:

```ts
const mockLeaveManagement = {
  create: jest.fn(),
  processApproval: jest.fn(),
  getBalance: jest.fn(),
  getLeaveTypes: jest.fn(),
};
```

No `beforeEach`, adicionar `{ provide: LeaveManagementService, useValue: mockLeaveManagement }` à lista de `providers`, e `jest.clearAllMocks()` já limpa os mocks de `mockLeaveManagement` automaticamente (é chamado no topo do `beforeEach` existente).

- [x] **Step 3: Verificar que a suite ainda compila (os testes de `createLeaveRequest`/`getLeaveBalance` só serão reescritos nas Tasks 6/9 seguintes — por agora só a injecção)**

```bash
npx jest src/attendance/attendance.service.spec.ts
```

Esperado: ainda `PASS` (nada usa `leaveManagement` ainda) — se `createLeaveRequest`/`getLeaveBalance` falharem por causa do provider em falta, confirma que o `providers` array foi actualizado correctamente.

- [x] **Step 4: Formatar**

```bash
npx prettier --write src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts
```

- [x] **Step 5: Commit**

```bash
git add src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts
git commit -m "refactor(attendance): injectar LeaveManagementService + mapa LeaveType→LeaveTypeConfig.code"
```

---

### Task 6: `createLeaveRequest` delega em `LeaveManagementService.create`

**Files:**
- Modify: `src/attendance/attendance.service.ts`
- Test: `src/attendance/attendance.service.spec.ts`
- Test: `test/integration/attendance/attendance.integration-spec.ts`

**Interfaces:**
- Consumes: `LeaveManagementService.create(dto: CreateLeaveManagementRequestDto, createdById: number)` (assinatura existente, `src/leave-management/leave-management.service.ts:286`).

- [x] **Step 1: Reescrever o teste unitário existente para reflectir a delegação (deve falhar antes do Step 2)**

Em `src/attendance/attendance.service.spec.ts`, substituir o bloco `describe('createLeaveRequest', ...)` por:

```ts
  describe('createLeaveRequest', () => {
    it('deve delegar em LeaveManagementService.create com o código traduzido', async () => {
      mockLeaveManagement.create.mockResolvedValue({ id: 1, userId: 1, status: 'PENDING' });

      const result = await service.createLeaveRequest(1, {
        type: 'VACATION' as any,
        startDate: '2024-08-01',
        endDate: '2024-08-05',
        reason: 'Férias',
      } as any);

      expect(mockLeaveManagement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          leaveTypeCode: 'VACATION',
          startDate: '2024-08-01',
          endDate: '2024-08-05',
          reason: 'Férias',
          durationMode: 'FULL_DAY',
        }),
        1,
      );
      expect(result).toBeDefined();
    });

    it('traduz SICK_LEAVE (Prisma) para o código SICK (LeaveTypeConfig)', async () => {
      mockLeaveManagement.create.mockResolvedValue({ id: 2, userId: 1, status: 'PENDING' });

      await service.createLeaveRequest(1, {
        type: 'SICK_LEAVE' as any,
        startDate: '2024-08-01',
        endDate: '2024-08-02',
        reason: 'Doença',
      } as any);

      expect(mockLeaveManagement.create).toHaveBeenCalledWith(
        expect.objectContaining({ leaveTypeCode: 'SICK' }),
        1,
      );
    });

    it('meio-dia → durationMode HALF_AM/HALF_PM conforme halfDayPeriod', async () => {
      mockLeaveManagement.create.mockResolvedValue({ id: 3, userId: 1, status: 'PENDING' });

      await service.createLeaveRequest(1, {
        type: 'VACATION' as any,
        startDate: '2024-08-01',
        endDate: '2024-08-01',
        reason: 'Manhã livre',
        halfDay: true,
        halfDayPeriod: 'PM' as any,
      } as any);

      expect(mockLeaveManagement.create).toHaveBeenCalledWith(
        expect.objectContaining({ durationMode: 'HALF_PM' }),
        1,
      );
    });
  });
```

- [x] **Step 2: Correr e confirmar que falha**

```bash
npx jest src/attendance/attendance.service.spec.ts -t "createLeaveRequest"
```

Esperado: `FAIL` — o código actual ainda chama `this.prisma.leaveRequest.create`, não `leaveManagement.create`.

- [x] **Step 3: Reescrever `createLeaveRequest`**

Substituir o método completo (linhas ~423-461 do ficheiro actual):

```ts
  async createLeaveRequest(userId: number, dto: CreateLeaveRequestDto) {
    // Validação de datas (end < start) já é feita por leave-management.create()
    // (leave-management.service.ts:290) — não duplicar aqui.
    const durationMode = dto.halfDay
      ? dto.halfDayPeriod === DayPeriod.PM
        ? DurationMode.HALF_PM
        : DurationMode.HALF_AM
      : DurationMode.FULL_DAY;

    // A partir daqui, a validação de sobreposição, saldo, antecedência
    // mínima, blackout periods e o fluxo de aprovação são inteiramente
    // responsabilidade de LeaveManagementService — attendance deixou de ter
    // a sua própria cópia divergente destas regras (Fase B da consolidação).
    return this.leaveManagement.create(
      {
        userId,
        leaveTypeCode: AttendanceService.LEAVE_TYPE_TO_CODE[dto.type],
        startDate: dto.startDate,
        endDate: dto.endDate,
        durationMode,
        reason: dto.reason,
        attachments: dto.attachments,
      },
      userId,
    );
  }
```


- [x] **Step 4: Correr o teste unitário e confirmar que passa**

```bash
npx jest src/attendance/attendance.service.spec.ts -t "createLeaveRequest"
```

- [x] **Step 5: Actualizar/confirmar o teste de integração existente**

`test/integration/attendance/attendance.integration-spec.ts:116-134` (`POST /attendance/leaves`) já usa `type: 'VACATION'` e espera `[201, 409]` — não precisa de alteração de conteúdo, mas só vai passar de facto depois da Task 2 (seed de `LeaveTypeConfig`+`LeaveBalance` em `test/integration/setup.ts`). Adicionar um novo teste ao mesmo `describe`, para provar que o saldo é mesmo deduzido (fecha o bug original que motivou a Fase B):

```ts
  describe('POST /attendance/leaves → consolidação com leave-management (Fase B)', () => {
    it('licença aprovada automaticamente (sem gestor atribuído) deduz o saldo real de LeaveBalance', async () => {
      const start = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const end = new Date(Date.now() + 61 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const before = await request(app.getHttpServer())
        .get('/attendance/my/leave-balance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const vacationBefore = before.body.find((b: any) => b.type === 'VACATION');

      const res = await request(app.getHttpServer())
        .post('/attendance/leaves')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ type: 'VACATION', startDate: start, endDate: end, reason: 'Teste consolidação Fase B' });

      expect([201, 409]).toContain(res.status);
      if (res.status !== 201) return; // 409 = já existe pedido sobreposto de uma corrida anterior; sem novo saldo a verificar

      const after = await request(app.getHttpServer())
        .get('/attendance/my/leave-balance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const vacationAfter = after.body.find((b: any) => b.type === 'VACATION');

      expect(vacationAfter.remaining).toBeLessThan(vacationBefore.remaining);
    });

    it('tipo sem LeaveTypeConfig configurado → 404 claro, não 500', async () => {
      // UNJUSTIFIED_ABSENCE está seedado (Task 1/2) — este teste prova a
      // mensagem de erro para um cenário onde o catálogo realmente não tem o
      // código, simulando uma BD sem o seed da Task 1 aplicado.
      await request(app.getHttpServer())
        .post('/attendance/leaves')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          type: 'TRAINING',
          startDate: '2020-01-01', // data no passado — falha noutra validação antes, prova só que não é 500
          endDate: '2020-01-02',
          reason: 'Teste',
        })
        .then(res => {
          expect(res.status).not.toBe(500);
        });
    });
  });
```

(O segundo teste é propositadamente leve — o objectivo é só garantir "nunca 500", não testar exaustivamente cada validação de `leave-management`, que já tem a sua própria suite de integração.)

- [x] **Step 6: Formatar**

```bash
npx prettier --write src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts test/integration/attendance/attendance.integration-spec.ts
```

- [x] **Step 7: Commit**

```bash
git add src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts test/integration/attendance/attendance.integration-spec.ts
git commit -m "fix(attendance): createLeaveRequest delega em LeaveManagementService — elimina 2º caminho de escrita em LeaveRequest"
```

(A corrida completa do Lote 1 fica reservada para a Task 10 — os testes de integração desta tarefa só devem ser corridos isoladamente aqui se tiveres uma BD `innova_test` local acessível; caso contrário, confirma por leitura e adia a corrida real para a Task 10.)

---

### Task 7: `reviewLeave` delega em `LeaveManagementService.processApproval` + preserva o registo de presença "ON_LEAVE"

**Files:**
- Modify: `src/attendance/attendance.service.ts`
- Test: `src/attendance/attendance.service.spec.ts`
- Test: `test/integration/attendance/attendance.integration-spec.ts`

**Interfaces:**
- Consumes: `LeaveManagementService.processApproval(requestId, approverId, dto: ApproveLeaveDto)` (assinatura **sem alteração** — confirmado na secção "Global Constraints": sem bypass de ADMIN/RH).
- Produces: mantém o efeito colateral já existente de `attendance` — quando o pedido fica `APPROVED`, os dias úteis do período recebem um `AttendanceRecord` com `status: ON_LEAVE` (método privado `createLeaveAttendanceRecords`, já existente, reaproveitado sem alterações na sua lógica interna).

- [x] **Step 1: Escrever o teste unitário (deve falhar)**

Em `src/attendance/attendance.service.spec.ts`, adicionar um novo `describe`, a seguir a `createLeaveRequest`:

```ts
  describe('reviewLeave', () => {
    it('APPROVED → delega em processApproval com ApprovalAction.APPROVE e marca presenças ON_LEAVE', async () => {
      mockLeaveManagement.processApproval.mockResolvedValue({
        id: 10,
        userId: 1,
        status: 'APPROVED',
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-02'),
        leaveType: 'VACATION',
      });

      await service.reviewLeave(10, { status: 'APPROVED' as any, reviewNotes: 'ok' }, 99);

      expect(mockLeaveManagement.processApproval).toHaveBeenCalledWith(10, 99, {
        action: 'APPROVE',
        notes: 'ok',
      });
      expect(mockAttendanceRecord.createMany).toHaveBeenCalled();
    });

    it('REJECTED → delega com ApprovalAction.REJECT e NÃO cria registos de presença', async () => {
      mockLeaveManagement.processApproval.mockResolvedValue({ id: 11, status: 'REJECTED' });

      await service.reviewLeave(11, { status: 'REJECTED' as any }, 99);

      expect(mockLeaveManagement.processApproval).toHaveBeenCalledWith(11, 99, {
        action: 'REJECT',
        notes: undefined,
      });
      expect(mockAttendanceRecord.createMany).not.toHaveBeenCalled();
    });

    it('estado diferente de APPROVED/REJECTED → BadRequestException, não chama processApproval', async () => {
      await expect(service.reviewLeave(12, { status: 'CANCELLED' as any }, 99)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockLeaveManagement.processApproval).not.toHaveBeenCalled();
    });
  });
```

Adicionar `BadRequestException` ao import de `@nestjs/common` no topo do spec se ainda não estiver importado (`import { NotFoundException, ConflictException } from '@nestjs/common';` → acrescentar `BadRequestException`).

- [x] **Step 2: Correr e confirmar que falha**

```bash
npx jest src/attendance/attendance.service.spec.ts -t "reviewLeave"
```

- [x] **Step 3: Reescrever `reviewLeave`**

Substituir o método completo (linhas ~463-483 do ficheiro actual):

```ts
  async reviewLeave(id: number, dto: ReviewLeaveDto, reviewerId: number) {
    // Só APPROVE/REJECT fazem sentido num "review" — DRAFT/PENDING/CANCELLED/
    // EXPIRED não são decisões de revisor. Antes desta consolidação o código
    // aceitava qualquer valor de LeaveStatus sem validar.
    if (dto.status !== LeaveStatus.APPROVED && dto.status !== LeaveStatus.REJECTED) {
      throw new BadRequestException(
        'Estado inválido para revisão — use APPROVED ou REJECTED',
      );
    }

    const action =
      dto.status === LeaveStatus.APPROVED ? ApprovalAction.APPROVE : ApprovalAction.REJECT;

    // Autorização real (quem pode decidir este pedido específico) passa a
    // ser inteiramente responsabilidade de LeaveManagementService — só o
    // aprovador atribuído no fluxo (gestor directo, ou RH em política de 2
    // níveis) pode decidir. @Roles(ADMIN, RH, GESTOR) no controller continua
    // a ser só o gate grosseiro de papel, igual ao que /leave/:id/approve já
    // usa.
    const updated = await this.leaveManagement.processApproval(id, reviewerId, {
      action,
      notes: dto.reviewNotes,
    });

    if (updated.status === LeaveStatus.APPROVED) {
      await this.createLeaveAttendanceRecords(updated as Prisma.LeaveRequestGetPayload<object>);
    }

    return updated;
  }
```

- [x] **Step 4: Correr o teste unitário e confirmar que passa**

```bash
npx jest src/attendance/attendance.service.spec.ts -t "reviewLeave"
```

- [x] **Step 5: Adicionar teste de integração — autorização correcta (gestor sim, admin fora da cadeia não)**

Em `test/integration/attendance/attendance.integration-spec.ts`, adicionar (precisa de `managerToken` — adicionar ao `beforeAll` se ainda não existir: `managerToken = await getToken(app.getHttpServer(), 'manager');`):

```ts
  describe('PATCH /attendance/leaves/:id/review — autorização delegada em leave-management (Fase B)', () => {
    it('ADMIN fora da cadeia de aprovação → 403 (antes desta consolidação, ADMIN aprovava qualquer licença)', async () => {
      // Cria um pedido cujo único aprovador possível seria o gestor directo
      // de int.employee — como int.employee não tem managerId definido neste
      // teste (a não ser que outro spec o tenha atribuído), o pedido é
      // auto-aprovado na submissão e não fica PENDING para rever; por isso
      // este teste foca-se no contrato de erro quando HÁ uma aprovação
      // pendente mas o chamador não é o aprovador — reaproveita-se o cenário
      // idêntico já coberto em leave-management.integration-spec.ts. Aqui
      // confirma-se apenas que a rota de attendance propaga o mesmo 403 (não
      // engole a excepção nem devolve 500).
      const res = await request(app.getHttpServer())
        .patch('/attendance/leaves/999999/review')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect([403, 404]).toContain(res.status);
    });

    it('estado inválido (nem APPROVED nem REJECTED) → 400', async () => {
      await request(app.getHttpServer())
        .patch('/attendance/leaves/1/review')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CANCELLED' })
        .expect(400);
    });
  });
```

- [x] **Step 6: Formatar**

```bash
npx prettier --write src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts test/integration/attendance/attendance.integration-spec.ts
```

- [x] **Step 7: Commit**

```bash
git add src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts test/integration/attendance/attendance.integration-spec.ts
git commit -m "fix(attendance): reviewLeave delega em LeaveManagementService.processApproval — só o aprovador atribuído decide"
```

---

### Task 8: `getLeaveBalance` — compor a partir do ledger real, preservando a forma de resposta actual

**Files:**
- Modify: `src/attendance/attendance.service.ts`
- Test: `src/attendance/attendance.service.spec.ts`
- Test: `test/integration/attendance/attendance.integration-spec.ts`

**Interfaces:**
- Consumes: `LeaveManagementService.getLeaveTypes(activeOnly?: boolean)` e `LeaveManagementService.getBalance(userId: number)` (ambos já públicos, assinaturas existentes).
- Produces: mantém a forma `Array<{ type: string; entitled: number; used: number; remaining: number }>` que `GET /attendance/my/leave-balance` e `GET /attendance/leaves/balance/:userId` já devolvem — só a **origem dos números** muda (de constantes hardcoded para o ledger real `LeaveTypeConfig.annualLimit` + `LeaveBalance`).

- [x] **Step 1: Escrever o teste unitário (deve falhar)**

Substituir o `describe('getLeaveBalance', ...)` existente por:

```ts
  describe('getLeaveBalance', () => {
    it('compõe entitled/used/remaining a partir do catálogo e do saldo real, mantendo a forma [{type,...}]', async () => {
      mockLeaveManagement.getLeaveTypes.mockResolvedValue([
        { code: 'VACATION', annualLimit: 22 },
        { code: 'SICK', annualLimit: null },
        { code: 'MATERNITY', annualLimit: 120 },
        { code: 'PATERNITY', annualLimit: 28 },
        { code: 'BEREAVEMENT', annualLimit: 5 },
        { code: 'JUSTIFIED_ABSENCE', annualLimit: 6 },
      ]);
      mockLeaveManagement.getBalance.mockResolvedValue([
        { leaveTypeCode: 'VACATION', used: 4, effectiveBalance: 18 },
      ]);

      const result = await service.getLeaveBalance(1);

      expect(result).toEqual(
        expect.arrayContaining([
          { type: 'VACATION', entitled: 22, used: 4, remaining: 18 },
          { type: 'SICK_LEAVE', entitled: 0, used: 0, remaining: 0 },
          { type: 'BEREAVEMENT', entitled: 5, used: 0, remaining: 5 },
        ]),
      );
      expect(result).toHaveLength(6);
    });

    it('utilizador sem nenhum LeaveBalance inicializado → remaining = entitled cheio (não 0)', async () => {
      mockLeaveManagement.getLeaveTypes.mockResolvedValue([{ code: 'VACATION', annualLimit: 22 }]);
      mockLeaveManagement.getBalance.mockResolvedValue([]);

      const result = await service.getLeaveBalance(1);
      const vacation = result.find(r => r.type === 'VACATION');

      expect(vacation).toEqual({ type: 'VACATION', entitled: 22, used: 0, remaining: 22 });
    });
  });
```

- [x] **Step 2: Correr e confirmar que falha**

```bash
npx jest src/attendance/attendance.service.spec.ts -t "getLeaveBalance"
```

- [x] **Step 3: Reescrever `getLeaveBalance`**

Substituir o método completo (linhas ~515-544 do ficheiro actual — pode remover também as constantes `entitlements` locais, que deixam de ser necessárias):

```ts
  async getLeaveBalance(userId: number) {
    // Fonte de verdade passa a ser LeaveTypeConfig (entitled) + LeaveBalance
    // (used/remaining reais), ambos geridos por LeaveManagementService — os
    // valores hardcoded (22/30/90/2/3/6) que existiam aqui antes da Fase B
    // divergiam do saldo mostrado em /leave/my/balance. A forma da resposta
    // (array de {type, entitled, used, remaining}) mantém-se idêntica para
    // não obrigar a alterações no frontend.
    const [types, balances] = await Promise.all([
      this.leaveManagement.getLeaveTypes(),
      this.leaveManagement.getBalance(userId),
    ]);

    const configByCode = new Map(types.map(t => [t.code, t]));
    const balanceByCode = new Map(balances.map(b => [b.leaveTypeCode, b]));

    return AttendanceService.LEGACY_BALANCE_TYPES.map(type => {
      const code = AttendanceService.LEAVE_TYPE_TO_CODE[type];
      const config = configByCode.get(code);
      const balance = balanceByCode.get(code);
      const entitled = config?.annualLimit ?? 0;
      const used = balance?.used ?? 0;
      const remaining = balance ? balance.effectiveBalance : entitled;
      return { type, entitled, used, remaining };
    });
  }
```

- [x] **Step 4: Correr o teste unitário e confirmar que passa**

```bash
npx jest src/attendance/attendance.service.spec.ts -t "getLeaveBalance"
```

- [x] **Step 5: Confirmar que os testes de integração existentes continuam a passar sem alteração**

`test/integration/attendance/attendance.integration-spec.ts:51-64` (`GET /attendance/my/leave-balance` → `Array.isArray(res.body)`) não precisa de nenhuma alteração — a forma da resposta é a mesma. Não adicionar novo teste aqui (já coberto indirectamente pelo teste "deduz o saldo real" da Task 6, que já lê este mesmo endpoint antes/depois).

- [x] **Step 6: Formatar**

```bash
npx prettier --write src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts
```

- [x] **Step 7: Commit**

```bash
git add src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts
git commit -m "fix(attendance): getLeaveBalance passa a usar o ledger real de leave-management, mantendo a forma da resposta"
```

---

### Task 9: Remover código morto e confirmar limpeza de acesso directo a `LeaveRequest`/`LeaveBalance`

**Files:**
- Modify: `src/attendance/attendance.service.ts`

**Interfaces:** nenhuma nova — tarefa de limpeza.

- [x] **Step 1: Confirmar que não sobra nenhum acesso directo a `leaveRequest`/`leaveBalance` em `attendance.service.ts`**

```bash
grep -n "prisma\.leaveRequest\|prisma\.read\.leaveRequest\|prisma\.leaveBalance\|prisma\.read\.leaveBalance" src/attendance/attendance.service.ts
```

Esperado: **zero ocorrências**. Se `getLeaves` (listagem admin, `GET /attendance/leaves`) ainda usar `this.prisma.read.leaveRequest.findMany` directamente — isso é **esperado e fica fora do âmbito desta Fase B**: é leitura pura de agregação/listagem (não escreve, não decide saldo), consistente com a excepção documentada em `docs/arquitetura-modular-analise.md` §4 ("leitura agregada pura para relatórios... é a única excepção tolerada"). Confirmar que `getLeaves` continua só a LER, nunca a escrever `LeaveRequest`/`LeaveBalance`.

- [x] **Step 2: Remover imports agora não usados, se houver**

```bash
npx eslint src/attendance/attendance.service.ts --config eslint.config.staged.mjs
```

Corrigir quaisquer `no-unused-vars` que apareçam (por exemplo, se `LeaveType`/`DayPeriod` deixaram de ser usados directamente — não deve ser o caso, ambos continuam em uso pelo mapa de tradução e por `createLeaveRequest`).

- [x] **Step 3: `tsc --noEmit` limpo**

```bash
npx tsc --noEmit
```

- [x] **Step 4: Commit (só se algo tiver mudado neste passo)**

```bash
git add -A
git commit -m "chore(attendance): limpeza pós-consolidação Fase B — confirmar zero escrita directa em LeaveRequest/LeaveBalance"
```

(Se não houver diff, pular o commit.)

---

### Task 10: Verificação completa — unit + integração (Lotes 1 e 5) + lint + prettier

**Files:** nenhum novo — só execução e correcção de eventuais regressões apanhadas aqui.

- [x] **Step 1: Suite unitária completa dos dois módulos**

```bash
npx jest src/attendance src/leave-management
```

Esperado: `PASS` em todos os ficheiros, incluindo `attendance.service.progress.spec.ts`, `attendance.controller.spec.ts`, `leave-management.service.progress.spec.ts`, `leave-management.controller.spec.ts` (nenhum deles foi tocado por este plano — confirmar que continuam verdes, não só os que editámos).

- [x] **Step 2: Suite completa do projecto (garantir zero regressão fora do escopo)**

```bash
npm test
```

- [x] **Step 3: Integração — Lote 1 (attendance) e Lote 5 (leave-management)**

Requer Postgres local (`innova_test`) e Redis a correr — ver `docs/superpowers/plans/../../CLAUDE.md`/memória de projecto "innova integration test infra" (`DB_POOL_MAX=5` em `.env.test`).

```bash
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(attendance)/"
npx cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/(leave-management)/"
```

Esperado: `PASS` nos dois lotes. Prestar atenção especial a:
- `leave-management.integration-spec.ts:275-281` (`'outro utilizador sem aprovação pendente não pode aprovar → 403'`) — **tem de continuar a passar sem alteração** (confirma a decisão de autorização tomada nas "Global Constraints").
- Os novos testes da Task 6/7 em `attendance.integration-spec.ts`.

Se `test:integration:auth`/outros scripts nomeados existirem em vez disto, usar o equivalente do `package.json` (`npm run test:integration` corre TODOS os 8 lotes sequencialmente — pode usar-se em alternativa, é só mais lento).

- [x] **Step 4: Se algum teste de integração falhar por causa de estado deixado por uma corrida anterior (saldo já parcialmente gasto)**

Confirmar que a Task 2 usa `update: { balance: ..., used: 0 }` (reset forçado) e não `update: {}` — se o ficheiro tiver sido escrito com `update: {}` por engano, corrigir antes de repetir.

- [x] **Step 5: Formatação e lint globais dos ficheiros tocados**

```bash
npx prettier --check src/attendance src/leave-management test/integration/attendance test/integration/leave-management prisma/seed.ts test/integration/setup.ts
npx eslint src/attendance src/leave-management --config eslint.config.staged.mjs
```

- [x] **Step 6: Actualizar `docs/arquitetura-modular-analise.md` — marcar a Fase B como concluída**

Editar a linha da tabela §13 (Roteiro):

```
| B | `attendance` deixa de escrever `LeaveRequest` directo — passa a usar `LeaveManagementService` | 3 | Médio (dados de saldo já divergentes hoje) | Risco financeiro/legal directo (saldo de férias errado) |
```

por:

```
| B | ~~`attendance` deixa de escrever `LeaveRequest` directo~~ — **concluída**: `createLeaveRequest`/`reviewLeave`/`getLeaveBalance` delegam em `LeaveManagementService`; corrigido também um bug colateral onde auto-aprovação sem gestor atribuído não deduzia saldo (achado durante a implementação, não estava na análise original) | 3 | — | Ver `docs/superpowers/plans/2026-09-04-fase-b-attendance-leave-consolidation.md` |
```

- [x] **Step 7: Commit final da tarefa de verificação**

```bash
git add docs/arquitetura-modular-analise.md
git commit -m "docs: marcar Fase B (consolidação attendance/leave-management) como concluída"
```

---

### Task 11: PR e CI (segue `CLAUDE.md` — obrigatório antes de qualquer merge para `main`)

**Files:** nenhum.

- [x] **Step 1: Criar branch (se ainda não estiveres numa) e push**

```bash
git checkout -b fix/attendance-leave-consolidation
git push -u origin fix/attendance-leave-consolidation
```

(Se o trabalho das tarefas anteriores já foi feito directamente numa branch de feature, saltar para o push.)

- [x] **Step 2: Abrir PR**

```bash
gh pr create --title "fix(attendance): consolidar sobre leave-management — elimina 2º caminho de escrita em LeaveRequest (Fase B)" --body "$(cat <<'EOF'
## Resumo
Implementa a Fase B do roteiro em `docs/arquitetura-modular-analise.md` §13: `attendance` deixava de escrever `LeaveRequest`/`LeaveBalance` diretamente via Prisma, bypassando por completo o motor de aprovação multi-nível e o ledger de saldo de `leave-management` — os dois ecrãs (`/attendance/leaves*` vs `/leave*`) podiam mostrar saldos de férias diferentes para o mesmo colaborador.

## Mudanças
- `attendance.createLeaveRequest`/`reviewLeave`/`getLeaveBalance` passam a delegar em `LeaveManagementService` em vez de aceder a `this.prisma.leaveRequest`/`leaveBalance` directamente.
- **Mudança de comportamento deliberada e confirmada:** `PATCH /attendance/leaves/:id/review` passa a exigir que o revisor seja o aprovador atribuído (gestor directo, ou RH em política de 2 níveis) — antes, qualquer ADMIN/RH/GESTOR aprovava/rejeitava a licença de qualquer colaborador sem nenhuma verificação de ownership. Decisão tomada explicitamente com o utilizador antes da implementação.
- Bug colateral corrigido em `leave-management`: auto-aprovação sem gestor atribuído (o caso mais comum neste dataset — nenhum utilizador tem `managerId`) marcava o pedido como `APPROVED` sem deduzir saldo nem notificar.
- Catálogo `LeaveTypeConfig` completado com os 3 códigos que faltavam (`JUSTIFIED_ABSENCE`, `UNJUSTIFIED_ABSENCE`, `PUBLIC_DUTY`) para cobrir os 10 valores do enum `LeaveType`.
- Sem alterações de rota, verbo ou forma de resposta — contrato HTTP idêntico para o frontend.

## Testes
- Unit: `src/attendance/attendance.service.spec.ts`, `src/leave-management/leave-management.service.spec.ts` — casos novos TDD para cada mudança.
- Integração: `test/integration/attendance/attendance.integration-spec.ts` (novo describe "consolidação Fase B") + `test/integration/leave-management/leave-management.integration-spec.ts` (sem alteração, confirmado ainda verde).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [x] **Step 3: Aguardar o check `quality` (Code Quality) ficar verde**

`main` está protegida (`required_status_checks: ["quality"]`, `enforce_admins: true`, per `CLAUDE.md`) — não há bypass. Vigiar até ficar verde; se o CI estiver indisponível, esperar, não contornar.

- [x] **Step 4: Merge (squash) depois do CI verde**

```bash
gh pr merge --squash --auto
```
