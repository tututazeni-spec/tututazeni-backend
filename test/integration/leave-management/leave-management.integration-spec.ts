import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
// FIXED (project-innova-leave-type-enum-mismatch): leaveTypeCode (livre,
// LeaveTypeConfig.code) é agora a chave real em LeaveBalance/LeaveRequest;
// leaveType (enum fixo de 10 valores) ficou opcional/best-effort. Usar aqui
// um valor real do enum (VACATION) continua válido — só deixou de ser
// obrigatório para não rebentar — e um segundo describe abaixo prova
// explicitamente que um código customizado fora do enum também funciona.
const LEAVE_TYPE_CODE = 'VACATION';
const CUSTOM_LEAVE_TYPE_CODE = 'SICK_SHORT';

describe('Leave Management Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let requestId: number;
  let customRequestId: number;
  let originalEmployeeManagerId: number | null;
  let originalEmployeeDeptId: number | null;
  let testDeptId: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    managerToken = await getToken(app.getHttpServer(), 'manager');
    rhToken = await getToken(app.getHttpServer(), 'rh');
    adminToken = await getToken(app.getHttpServer(), 'admin');

    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    employeeId = employee!.id;
    originalEmployeeManagerId = employee!.managerId;
    originalEmployeeDeptId = employee!.departmentId;
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    managerId = manager!.id;

    await prisma.user.update({ where: { id: employeeId }, data: { managerId } });

    const dept = await prisma.department.upsert({
      where: { code: 'DEPT-INT-TEST' },
      update: {},
      create: { code: 'DEPT-INT-TEST', name: 'Dept Integração Teste' },
    });
    testDeptId = dept.id;
    await prisma.user.update({ where: { id: employeeId }, data: { departmentId: testDeptId } });

    await prisma.leaveTypeConfig.upsert({
      where: { code: LEAVE_TYPE_CODE },
      update: {},
      create: {
        code: LEAVE_TYPE_CODE,
        name: 'Férias Integração',
        category: 'STATUTORY',
        isPaid: true,
        annualLimit: 22,
        active: true,
        countWorkDaysOnly: true,
      },
    });
    await prisma.leaveBalance.upsert({
      where: { userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: LEAVE_TYPE_CODE } },
      update: { balance: 22, used: 0 },
      create: {
        userId: employeeId,
        leaveTypeCode: LEAVE_TYPE_CODE,
        leaveType: 'VACATION',
        balance: 22,
        used: 0,
      },
    });

    // Código customizado (fora dos 10 valores do enum LeaveType) — prova que
    // deixou de rebentar (project-innova-leave-type-enum-mismatch).
    await prisma.leaveTypeConfig.upsert({
      where: { code: CUSTOM_LEAVE_TYPE_CODE },
      update: {},
      create: {
        code: CUSTOM_LEAVE_TYPE_CODE,
        name: 'Baixa Médica Curta',
        category: 'MEDICAL',
        isPaid: true,
        annualLimit: 5,
        active: true,
        countWorkDaysOnly: true,
      },
    });
    await prisma.leaveBalance.upsert({
      where: {
        userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: CUSTOM_LEAVE_TYPE_CODE },
      },
      update: { balance: 5, used: 0 },
      create: {
        userId: employeeId,
        leaveTypeCode: CUSTOM_LEAVE_TYPE_CODE,
        leaveType: null,
        balance: 5,
        used: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.update({
      where: { id: employeeId },
      data: { managerId: originalEmployeeManagerId, departmentId: originalEmployeeDeptId },
    });

    if (requestId) {
      await prisma.leaveImpactPreview.deleteMany({ where: { requestId } }).catch(() => undefined);
      await prisma.leaveDocument.deleteMany({ where: { requestId } }).catch(() => undefined);
      await prisma.leaveApproval.deleteMany({ where: { requestId } }).catch(() => undefined);
      await prisma.leaveRequest.deleteMany({ where: { id: requestId } }).catch(() => undefined);
    }
    if (customRequestId) {
      await prisma.leaveApproval
        .deleteMany({ where: { requestId: customRequestId } })
        .catch(() => undefined);
      await prisma.leaveRequest
        .deleteMany({ where: { id: customRequestId } })
        .catch(() => undefined);
    }
    await prisma.leaveBalanceHistory
      .deleteMany({ where: { userId: employeeId } })
      .catch(() => undefined);
    await prisma.leaveBalance.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    await prisma.leaveTypeConfig
      .deleteMany({ where: { code: { in: [LEAVE_TYPE_CODE, CUSTOM_LEAVE_TYPE_CODE] } } })
      .catch(() => undefined);
    await prisma.notificationLog
      .deleteMany({ where: { userId: { in: [employeeId, managerId] } } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Tipos de licença e políticas', () => {
    it('colaborador não pode criar tipo de licença → 403', async () => {
      await request(app.getHttpServer())
        .post('/leave/types')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          code: 'X',
          name: 'X',
          category: 'OTHER',
          isPaid: true,
          requiresApproval: true,
          requiresDocument: false,
          active: true,
        })
        .expect(403);
    });

    it('GET /leave/types — inclui o tipo criado no beforeAll', async () => {
      const res = await request(app.getHttpServer())
        .get('/leave/types')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((t: any) => t.code === LEAVE_TYPE_CODE)).toBe(true);
    });
  });

  describe('Filtro por departamento (bug: User não tem relação "employee")', () => {
    it('GET /leave?department=... — não deve 500 (era Unknown argument employee)', async () => {
      await request(app.getHttpServer())
        .get('/leave')
        .query({ department: 'Dept Integração' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('GET /leave/dashboard?department=... — não deve 500', async () => {
      await request(app.getHttpServer())
        .get('/leave/dashboard')
        .query({ department: 'Dept Integração' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('GET /leave/calendar?department=... — não deve 500', async () => {
      await request(app.getHttpServer())
        .get('/leave/calendar')
        .query({ department: 'Dept Integração' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });
  });

  describe('Conflict-check (ownership A10-23)', () => {
    it('colaborador não pode verificar conflitos de outro utilizador → 404', async () => {
      await request(app.getHttpServer())
        .get('/leave/conflict-check')
        .query({ userId: managerId, startDate: '2026-08-01', endDate: '2026-08-05' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('colaborador verifica os seus próprios conflitos → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/leave/conflict-check')
        .query({ userId: employeeId, startDate: '2026-08-01', endDate: '2026-08-05' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.hasUserConflict).toBe(false);
    });
  });

  describe('Submissão e fluxo de aprovação (bug: gestor directo nunca era adicionado — auto-aprovava tudo)', () => {
    it('colaborador submete pedido de férias → fica PENDING, não auto-aprovado', async () => {
      const res = await request(app.getHttpServer())
        .post('/leave')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          userId: employeeId,
          leaveTypeCode: LEAVE_TYPE_CODE,
          startDate: '2026-09-07',
          endDate: '2026-09-09',
        })
        .expect(201);
      requestId = res.body.id;
      expect(res.body.status).toBe('PENDING');
    });

    it('foi criado um nível de aprovação para o gestor directo (não fica órfão)', async () => {
      const approval = await prisma.leaveApproval.findFirst({
        where: { requestId, approverId: managerId },
      });
      expect(approval).toBeTruthy();
      expect(approval!.level).toBe(1);
    });

    it('gestor vê o pedido nas suas aprovações pendentes', async () => {
      const res = await request(app.getHttpServer())
        .get('/leave/pending-approvals')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.id === requestId)).toBe(true);
    });

    it('outro utilizador sem aprovação pendente não pode aprovar → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/leave/${requestId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'APPROVE' })
        .expect(403);
    });

    it('gestor aprova o pedido → APPROVED, saldo deduzido, enrollment activo pausado', async () => {
      const course = await prisma.course.upsert({
        where: { internalCode: 'INT-TEST-LEAVE-COURSE' },
        update: {},
        create: {
          title: 'Curso Integração Leave',
          internalCode: 'INT-TEST-LEAVE-COURSE',
          status: 'PUBLISHED',
        },
      });
      await prisma.enrollment.upsert({
        where: { courseId_userId: { courseId: course.id, userId: employeeId } },
        update: { pausedAt: null },
        create: { courseId: course.id, userId: employeeId, status: 'NOT_STARTED' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/leave/${requestId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'APPROVE' })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');

      const balance = await prisma.leaveBalance.findUnique({
        where: { userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: LEAVE_TYPE_CODE } },
      });
      expect(balance!.balance).toBeLessThan(22);

      const enrollment = await prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: employeeId } },
      });
      expect(enrollment!.pausedAt).toBeTruthy();

      await prisma.enrollment.deleteMany({ where: { courseId: course.id } });
      await prisma.course.delete({ where: { id: course.id } });
    });

    it('GET /leave/my/balance — reflecte o saldo efectivo', async () => {
      const res = await request(app.getHttpServer())
        .get('/leave/my/balance')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const vacation = res.body.find((b: any) => b.leaveTypeCode === LEAVE_TYPE_CODE);
      expect(vacation.balance).toBeLessThan(22);
    });

    it('GET /leave/my/balance/history — regista o movimento', async () => {
      const res = await request(app.getHttpServer())
        .get('/leave/my/balance/history')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((h: any) => h.reason === 'Licença aprovada')).toBe(true);
    });

    it('colaborador cancela o pedido aprovado → devolve saldo', async () => {
      await request(app.getHttpServer())
        .patch(`/leave/${requestId}/cancel`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const balance = await prisma.leaveBalance.findUnique({
        where: { userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: LEAVE_TYPE_CODE } },
      });
      expect(balance!.balance).toBe(22);
    });
  });

  describe('Código de licença customizado (fix: project-innova-leave-type-enum-mismatch)', () => {
    // Antes desta correcção, qualquer LeaveTypeConfig.code fora dos 10
    // valores fixos do enum LeaveType rebentava com PrismaClientValidationError
    // ("Unknown value") em create()/deductBalance()/returnBalance() — não uma
    // excepção de negócio, um erro 500. SICK_SHORT é exactamente o exemplo
    // dado pelo doc comment do CreateLeaveTypeDto como uso normal.
    it('colaborador submete pedido com código customizado → não rebenta, fica PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/leave')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          userId: employeeId,
          leaveTypeCode: CUSTOM_LEAVE_TYPE_CODE,
          startDate: '2026-10-05',
          endDate: '2026-10-06',
        })
        .expect(201);
      customRequestId = res.body.id;
      expect(res.body.status).toBe('PENDING');
      expect(res.body.leaveTypeCode).toBe(CUSTOM_LEAVE_TYPE_CODE);
    });

    it('gestor aprova → saldo do código customizado é deduzido sem rebentar', async () => {
      await request(app.getHttpServer())
        .patch(`/leave/${customRequestId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'APPROVE' })
        .expect(200);

      const balance = await prisma.leaveBalance.findUnique({
        where: {
          userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: CUSTOM_LEAVE_TYPE_CODE },
        },
      });
      expect(balance).toBeTruthy();
      expect(balance!.balance).toBeLessThan(5); // saldo inicial 5, deduzido sem rebentar
      // leaveType (enum fixo) fica null para um código que não é um dos 10
      // valores — best-effort, não força um valor inventado.
      expect(balance!.leaveType).toBeNull();
    });

    it('colaborador cancela → devolve saldo do código customizado sem rebentar', async () => {
      await request(app.getHttpServer())
        .patch(`/leave/${customRequestId}/cancel`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const balance = await prisma.leaveBalance.findUnique({
        where: {
          userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: CUSTOM_LEAVE_TYPE_CODE },
        },
      });
      expect(balance!.balance).toBe(5);
    });
  });

  describe('Gestão de saldos (RH)', () => {
    it('RH actualiza saldo directamente', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/leave/balance/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ leaveTypeCode: LEAVE_TYPE_CODE, balance: 10, reason: 'Ajuste manual' })
        .expect(200);
      expect(res.body.balance).toBe(10);
    });

    it('RH acumula saldo em lote', async () => {
      const res = await request(app.getHttpServer())
        .post('/leave/balance/accrue')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userIds: [employeeId], leaveTypeCode: LEAVE_TYPE_CODE, days: 2 })
        .expect(201);
      expect(res.body.accrued).toBe(1);

      const balance = await prisma.leaveBalance.findUnique({
        where: { userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: LEAVE_TYPE_CODE } },
      });
      expect(balance!.balance).toBe(12);
    });
  });

  describe('Analytics', () => {
    it('RH vê relatório de absenteísmo', async () => {
      const res = await request(app.getHttpServer())
        .get('/leave/analytics/absenteeism')
        .query({ from: '2026-01-01', to: '2026-12-31' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // §10-§13: saldos reservados, configurações versionadas, integrações
  // ══════════════════════════════════════════════════════════════════
  describe('Reservas de saldo, configurações e integrações (§10-§13)', () => {
    const NOTE = 'INT-TEST ';
    const createdRequestIds: number[] = [];
    let rhId: number;
    let reqA: number; // 3 dias úteis, fica PENDING e é recusado
    let reqB: number; // 5 dias úteis, aprovado → ON_LEAVE
    const balanceRow = () =>
      prisma.leaveBalance.findUnique({
        where: { userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: LEAVE_TYPE_CODE } },
      });
    const submit = (startDate: string, endDate: string, extra: Record<string, unknown> = {}) =>
      request(app.getHttpServer())
        .post('/leave')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, leaveTypeCode: LEAVE_TYPE_CODE, startDate, endDate, ...extra });

    beforeAll(async () => {
      rhId = (await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } }))!.id;
      await prisma.leaveBalance.update({
        where: { userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: LEAVE_TYPE_CODE } },
        data: { balance: 22, used: 0, reserved: 0 },
      });
    });

    afterAll(async () => {
      // filhos antes dos pais e sempre por requestId — nunca por userId
      for (const id of createdRequestIds) {
        await prisma.attendanceRecord
          .deleteMany({ where: { leaveRequestId: id } })
          .catch(() => undefined);
        await prisma.leaveApproval.deleteMany({ where: { requestId: id } }).catch(() => undefined);
        await prisma.leaveImpactPreview
          .deleteMany({ where: { requestId: id } })
          .catch(() => undefined);
        await prisma.leaveRequest.deleteMany({ where: { id } }).catch(() => undefined);
      }
      await prisma.leaveSettingVersion
        .deleteMany({ where: { changeNote: { startsWith: NOTE } } })
        .catch(() => undefined);
      await prisma.leaveHoliday
        .deleteMany({ where: { name: { startsWith: NOTE } } })
        .catch(() => undefined);
      await prisma.leaveDelegation
        .deleteMany({ where: { delegatorId: managerId } })
        .catch(() => undefined);
    });

    it('submeter reserva os dias (saldo atribuído intacto) e numera o pedido', async () => {
      const res = await submit('2031-05-12', '2031-05-14').expect(201); // seg-qua
      reqA = res.body.id;
      createdRequestIds.push(reqA);
      expect(res.body.requestNumber).toMatch(/^LV-\d{4}-\d{6}$/);
      expect(res.body.submittedAt).toBeTruthy();

      const b = await balanceRow();
      expect(b!.balance).toBe(22);
      expect(b!.reserved).toBe(3);
    });

    it('o disponível desconta as reservas: pedido que já não cabe → 400', async () => {
      const res = await submit('2031-06-02', '2031-06-27').expect(400); // 20 úteis > 19
      expect(res.body.message).toMatch(/Saldo insuficiente/);
    });

    it('pedidos concorrentes não sobre-reservam o saldo', async () => {
      const results = await Promise.all([
        submit('2031-07-07', '2031-07-18'), // 10 úteis
        submit('2031-08-04', '2031-08-15'), // 10 úteis
        submit('2031-09-01', '2031-09-12'), // 10 úteis
      ]);
      for (const r of results) if (r.status === 201) createdRequestIds.push(r.body.id);
      // 22 − 3 já reservados = 19 → só cabe um de 10
      expect(results.filter(r => r.status === 201)).toHaveLength(1);
      const b = await balanceRow();
      expect(b!.reserved).toBe(13);
      expect(b!.reserved).toBeLessThanOrEqual(b!.balance);
    });

    it('recusar exige justificação e liberta a reserva', async () => {
      await request(app.getHttpServer())
        .patch(`/leave/${reqA}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'REJECT' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/leave/${reqA}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'REJECT', notes: 'Equipa sem cobertura' })
        .expect(200);

      const b = await balanceRow();
      expect(b!.reserved).toBe(10); // 13 − 3
      expect(b!.balance).toBe(22);
    });

    it('aprovar converte reservado em gozado e sincroniza a assiduidade (sem duplicar)', async () => {
      const res = await submit('2031-10-06', '2031-10-10').expect(201); // seg-sex
      reqB = res.body.id;
      createdRequestIds.push(reqB);
      await request(app.getHttpServer())
        .patch(`/leave/${reqB}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'APPROVE' })
        .expect(200);

      const b = await balanceRow();
      expect(b!.used).toBe(5);
      expect(b!.balance).toBe(17);
      expect(b!.reserved).toBe(10); // só o pedido concorrente vencedor continua reservado

      const rows = await prisma.attendanceRecord.findMany({ where: { leaveRequestId: reqB } });
      expect(rows).toHaveLength(5);
      expect(rows.every(r => r.status === 'ON_LEAVE')).toBe(true);
    });

    it('cancelar o aprovado devolve saldo e remove os registos ON_LEAVE (RH regista quem)', async () => {
      await request(app.getHttpServer())
        .patch(`/leave/${reqB}/cancel`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'Necessidade de serviço' })
        .expect(200);

      const r = await prisma.leaveRequest.findUnique({ where: { id: reqB } });
      expect(r!.status).toBe('CANCELLED');
      expect(r!.cancelledById).toBe(rhId);
      expect(r!.cancelReason).toBe('Necessidade de serviço');
      expect(r!.cancelledAt).toBeTruthy();
      expect(await prisma.attendanceRecord.count({ where: { leaveRequestId: reqB } })).toBe(0);

      const b = await balanceRow();
      expect(b!.balance).toBe(22);
      expect(b!.used).toBe(0);
    });

    it('outro utilizador não cancela pedidos alheios → 403/404', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/leave/${reqA}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect([403, 404]).toContain(res.status);
    });

    // ── Configurações versionadas ──────────────────────────────────
    it('colaborador e gestor não acedem às configurações → 403', async () => {
      await request(app.getHttpServer())
        .get('/leave/settings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .patch('/leave/settings')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ hoursPerDay: 7, changeNote: `${NOTE}x` })
        .expect(403);
    });

    it('gravar exige motivo, valida entre campos e rejeita campos desconhecidos', async () => {
      const patch = (body: Record<string, unknown>) =>
        request(app.getHttpServer())
          .patch('/leave/settings')
          .set('Authorization', `Bearer ${rhToken}`)
          .send(body);
      await patch({ hoursPerDay: 7 }).expect(400);
      await patch({ workWeekDays: [], changeNote: `${NOTE}vazia` }).expect(400);
      await patch({ vacationWindowStart: '06-01', changeNote: `${NOTE}so inicio` }).expect(400);
      await patch({ lixo: 1, changeNote: `${NOTE}lixo` }).expect(400);
    });

    it('nova versão fica no histórico com as chaves alteradas e entra em vigor', async () => {
      const res = await request(app.getHttpServer())
        .patch('/leave/settings')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ decisionSlaDays: 5, changeNote: `${NOTE}SLA 5 dias` })
        .expect(200);
      expect(res.body.settings.decisionSlaDays).toBe(5);

      const hist = await request(app.getHttpServer())
        .get('/leave/settings/history')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const entry = hist.body.find((h: any) => h.changeNote === `${NOTE}SLA 5 dias`);
      expect(entry.changedKeys).toEqual(['decisionSlaDays']);
      expect(entry.createdById).toBe(rhId);
      expect(entry.scheduled).toBe(false);

      // repetir sem alterar nada é recusado
      await request(app.getHttpServer())
        .patch('/leave/settings')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ decisionSlaDays: 5, changeNote: `${NOTE}igual` })
        .expect(400);
    });

    it('alteração agendada para o futuro não entra em vigor já', async () => {
      const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .patch('/leave/settings')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ hoursPerDay: 6, effectiveFrom: future, changeNote: `${NOTE}jornada de 6h` })
        .expect(200);
      expect(res.body.settings.hoursPerDay).toBe(8);
      expect(res.body.upcoming.changedKeys).toEqual(['hoursPerDay']);
    });

    // ── Feriados por localização ───────────────────────────────────
    it('feriado personalizado reduz os dias úteis da duração', async () => {
      const preview = () =>
        request(app.getHttpServer())
          .get('/leave/duration-preview')
          .query({ leaveTypeCode: LEAVE_TYPE_CODE, startDate: '2031-11-17', endDate: '2031-11-21' })
          .set('Authorization', `Bearer ${employeeToken}`)
          .expect(200);
      expect((await preview()).body.workDays).toBe(5);

      await request(app.getHttpServer())
        .post('/leave/settings/holidays')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: `${NOTE}Feriado`, date: '2031-11-19' })
        .expect(201);
      // duplicado na mesma data/localização
      await request(app.getHttpServer())
        .post('/leave/settings/holidays')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: `${NOTE}Outro`, date: '2031-11-19' })
        .expect(409);

      expect((await preview()).body.workDays).toBe(4);
    });

    // ── Delegação de aprovadores ───────────────────────────────────
    it('com delegação activa a etapa vai para o substituto e fica no histórico', async () => {
      const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const created = await request(app.getHttpServer())
        .post('/leave/settings/delegations')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ delegateId: rhId, startDate: from, endDate: to, reason: 'Férias do gestor' })
        .expect(201);
      // sobreposição → 409
      await request(app.getHttpServer())
        .post('/leave/settings/delegations')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ delegateId: rhId, startDate: from, endDate: to })
        .expect(409);

      const res = await submit('2031-12-01', '2031-12-02').expect(201);
      createdRequestIds.push(res.body.id);
      const approval = await prisma.leaveApproval.findFirst({
        where: { requestId: res.body.id },
        include: { reassignments: true },
      });
      expect(approval!.approverId).toBe(rhId);
      expect(approval!.reassignments[0]).toMatchObject({
        fromApproverId: managerId,
        toApproverId: rhId,
        kind: 'DELEGATE',
      });

      await request(app.getHttpServer())
        .delete(`/leave/settings/delegations/${created.body.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    // ── Payroll ────────────────────────────────────────────────────
    it('feed do Payroll: RH vê, colaborador não; só pedidos aprovados', async () => {
      await request(app.getHttpServer())
        .get('/leave/payroll-feed')
        .query({ period: '2031-10' })
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/leave/payroll-feed')
        .query({ period: 'outubro' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(400);
      const res = await request(app.getHttpServer())
        .get('/leave/payroll-feed')
        .query({ period: '2031-10' })
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      // reqB foi cancelado → não consta
      expect(res.body.leaves.some((l: any) => l.requestId === reqB)).toBe(false);
    });

    // ── Transição de saldos ────────────────────────────────────────
    it('transição de fim de ano guarda o transitado e é idempotente', async () => {
      await prisma.leaveTypeConfig.update({
        where: { code: LEAVE_TYPE_CODE },
        data: { allowCarryOver: true, carryOverLimit: 5 },
      });
      await prisma.leaveBalance.update({
        where: { userId_leaveTypeCode: { userId: employeeId, leaveTypeCode: LEAVE_TYPE_CODE } },
        data: { balance: 9, reserved: 0, used: 0 },
      });

      const run = () =>
        request(app.getHttpServer())
          .post('/leave/balance/carry-over')
          .query({ year: 2099 })
          .set('Authorization', `Bearer ${rhToken}`)
          .expect(201);
      await run();
      expect((await balanceRow())!.balance).toBe(27); // 22 anuais + min(9, 5)

      await run(); // 2ª vez: nada muda
      expect((await balanceRow())!.balance).toBe(27);

      await prisma.leaveTypeConfig.update({
        where: { code: LEAVE_TYPE_CODE },
        data: { allowCarryOver: false, carryOverLimit: null },
      });
      await prisma.leaveBalanceHistory.deleteMany({
        where: { userId: employeeId, kind: 'CARRY_OVER' },
      });
    });
  });
});
