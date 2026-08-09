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
});
