import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const OTHER_EMPLOYEE_EMAIL = 'int.academic.other@innova-test.com';

describe('Academic Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let gestorToken: string;
  let otherEmployeeToken: string;
  let employeeId: number;
  let otherEmployeeId: number;

  let yearId: string;
  let programId: string;
  let mandatoryProgramId: string;
  let classId: string;
  let enrollmentId: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

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
    rhToken = await getToken(app.getHttpServer(), 'rh');
    gestorToken = await getToken(app.getHttpServer(), 'manager');

    const employeeUser = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employeeUser!.id;

    // Segundo colaborador — necessário para os testes de ownership (A10-15)
    const colaboradorRole = await prisma.role.findUnique({ where: { code: 'COLABORADOR' } });
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    const password = await bcrypt.hash('Test@1234', 10);
    const otherEmployee = await prisma.user.upsert({
      where: { email: OTHER_EMPLOYEE_EMAIL },
      update: {},
      create: {
        email: OTHER_EMPLOYEE_EMAIL,
        fullName: 'Outro Colaborador Academic',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });
    otherEmployeeId = otherEmployee.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: OTHER_EMPLOYEE_EMAIL, password: 'Test@1234' })
      .expect(201);
    otherEmployeeToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.academicGrade.deleteMany({ where: {} }).catch(() => undefined);
    await prisma.academicEnrollment
      .deleteMany({ where: { userId: { in: [employeeId, otherEmployeeId] } } })
      .catch(() => undefined);
    await prisma.academicTranscript
      .deleteMany({ where: { userId: { in: [employeeId, otherEmployeeId] } } })
      .catch(() => undefined);
    if (classId)
      await prisma.academicClass.deleteMany({ where: { id: classId } }).catch(() => undefined);
    if (programId || mandatoryProgramId)
      await prisma.academicProgram
        .deleteMany({ where: { id: { in: [programId, mandatoryProgramId].filter(Boolean) } } })
        .catch(() => undefined);
    if (yearId) {
      // AcademicPeriod referencia yearId com FK RESTRICT — tem de ser
      // eliminado antes do ano, senão a eliminação do ano falha silenciosamente
      // (catch) e o registo fica órfão, bloqueando reexecuções futuras (nome
      // do ano é único).
      await prisma.academicPeriod.deleteMany({ where: { yearId } }).catch(() => undefined);
      await prisma.academicYear.deleteMany({ where: { id: yearId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: OTHER_EMPLOYEE_EMAIL } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Anos lectivos e períodos', () => {
    it('RH cria ano lectivo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/years')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: '2026/2027',
          startDate: '2026-09-01',
          endDate: '2027-07-31',
          isCurrent: true,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      yearId = res.body.id;
    });

    it('colaborador não pode criar ano lectivo → 403', async () => {
      await request(app.getHttpServer())
        .post('/academic/years')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: '2027/2028', startDate: '2027-09-01', endDate: '2028-07-31' })
        .expect(403);
    });

    it('lista anos lectivos → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/academic/years')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('ano corrente reflecte o isCurrent definido → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/academic/years/current')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', yearId);
    });

    it('RH cria período dentro do ano → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/periods')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ yearId, name: '1º Semestre', startDate: '2026-09-01', endDate: '2027-01-31' })
        .expect(201);
      expect(res.body).toHaveProperty('yearId', yearId);
    });

    it('período com yearId inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/academic/periods')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          yearId: 'não-existe',
          name: '2º Semestre',
          startDate: '2027-02-01',
          endDate: '2027-07-31',
        })
        .expect(404);
    });
  });

  describe('Programas', () => {
    it('GESTOR cria programa opcional → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/programs')
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({ code: 'PROG-INT-001', name: 'Programa Integração', durationHours: 40 })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      programId = res.body.id;
    });

    it('código de programa duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/academic/programs')
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({ code: 'PROG-INT-001', name: 'Duplicado', durationHours: 10 })
        .expect(409);
    });

    it('cria programa obrigatório (isMandatory) para testar auto-aprovação', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/programs')
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({
          code: 'PROG-INT-002',
          name: 'Programa Obrigatório Integração',
          durationHours: 20,
          isMandatory: true,
        })
        .expect(201);
      mandatoryProgramId = res.body.id;
    });

    it('lista programas → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/academic/programs')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('detalhe de programa existente → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/academic/programs/${programId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', programId);
    });

    it('detalhe de programa inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/academic/programs/nao-existe')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('GESTOR cria turma para o programa → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/classes')
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({
          programId,
          name: 'Turma Integração A',
          startDate: '2026-09-05',
          endDate: '2026-12-15',
        })
        .expect(201);
      classId = res.body.id;
    });

    it('turma com programId inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/academic/classes')
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({
          programId: 'nao-existe',
          name: 'Turma Fantasma',
          startDate: '2026-09-05',
          endDate: '2026-12-15',
        })
        .expect(404);
    });
  });

  describe('Matrículas — ownership (A10-15)', () => {
    it('colaborador matricula-se a si próprio (programa opcional) → PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/enrollments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, programId, classId })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      enrollmentId = res.body.id;
    });

    it('matrícula duplicada no mesmo programa → 409', async () => {
      await request(app.getHttpServer())
        .post('/academic/enrollments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, programId })
        .expect(409);
    });

    it('colaborador não pode matricular outro utilizador → 404 (ownership)', async () => {
      await request(app.getHttpServer())
        .post('/academic/enrollments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: otherEmployeeId, programId: mandatoryProgramId })
        .expect(404);
    });

    it('RH pode matricular outro utilizador', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/enrollments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: otherEmployeeId, programId })
        .expect(201);
      expect(res.body.userId).toBe(otherEmployeeId);
    });

    it('matrícula em programa obrigatório é auto-aprovada (APPROVED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/enrollments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, programId: mandatoryProgramId })
        .expect(201);
      expect(res.body.status).toBe('APPROVED');
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/academic/enrollments')
        .send({ userId: employeeId, programId })
        .expect(401);
    });
  });

  describe('Aprovação de matrícula', () => {
    it('GESTOR aprova matrícula PENDING → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/academic/enrollments/${enrollmentId}/approve`)
        .set('Authorization', `Bearer ${gestorToken}`)
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('aprovar matrícula já aprovada → 400', async () => {
      await request(app.getHttpServer())
        .put(`/academic/enrollments/${enrollmentId}/approve`)
        .set('Authorization', `Bearer ${gestorToken}`)
        .expect(400);
    });

    it('colaborador não pode aprovar matrículas → 403', async () => {
      await request(app.getHttpServer())
        .put(`/academic/enrollments/${enrollmentId}/approve`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Minhas matrículas', () => {
    it('lista as matrículas do colaborador autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/academic/my-enrollments?page=1&limit=20')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Notas — ownership (A10-15)', () => {
    it('GESTOR lança nota para a matrícula → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/academic/grades')
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({ enrollmentId, courseId: 'course-1', score: 85 })
        .expect(201);
      expect(res.body).toHaveProperty('id');
    });

    it('nota para matrícula inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/academic/grades')
        .set('Authorization', `Bearer ${gestorToken}`)
        .send({ enrollmentId: 'nao-existe', courseId: 'course-1', score: 50 })
        .expect(404);
    });

    it('o dono da matrícula pode ver as suas notas → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/academic/enrollments/${enrollmentId}/grades`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('outro colaborador não pode ver notas alheias → 404', async () => {
      await request(app.getHttpServer())
        .get(`/academic/enrollments/${enrollmentId}/grades`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });

    it('GESTOR (privilegiado) pode ver notas de qualquer matrícula', async () => {
      await request(app.getHttpServer())
        .get(`/academic/enrollments/${enrollmentId}/grades`)
        .set('Authorization', `Bearer ${gestorToken}`)
        .expect(200);
    });
  });

  describe('Transcrição', () => {
    it('colaborador vê a própria transcrição → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/academic/transcript')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('enrollments');
    });

    it('colaborador não pode ver transcrição de outro por :userId → 403', async () => {
      await request(app.getHttpServer())
        .get(`/academic/transcript/${otherEmployeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH pode ver transcrição de qualquer colaborador por :userId → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/academic/transcript/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('enrollments');
    });
  });

  describe('Relatório académico', () => {
    it('RH acede ao relatório → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/academic/report')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('totalPrograms');
    });

    it('colaborador não acede ao relatório → 403', async () => {
      await request(app.getHttpServer())
        .get('/academic/report')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });
});
