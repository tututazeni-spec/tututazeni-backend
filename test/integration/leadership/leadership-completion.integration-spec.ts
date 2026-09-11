import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// Conclusão de participante e resultados do programa (Task 6) ponta-a-ponta:
// critérios de conclusão, emissão idempotente do Certificate canónico e KPIs.
describe('Leadership Completion (integração)', () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: number;
  let managerId: number;
  let adminId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const CODE = `LDR-DONE-${Date.now()}`;
  let programId: number;

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

    adminToken = await getToken(app.getHttpServer(), 'admin');
    employeeToken = await getToken(app.getHttpServer(), 'employee');

    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    const admin = await prisma.user.findUnique({ where: { email: 'int.admin@innova-test.com' } });
    employeeId = employee!.id;
    managerId = manager!.id;
    adminId = admin!.id;

    const program = await prisma.leadershipProgram.create({
      data: {
        code: CODE,
        name: 'Programa Conclusão',
        level: 'INITIAL',
        createdById: adminId,
        certificationEnabled: true,
        certificateTitle: 'Certificado de Liderança',
        minFinalScore: 70,
        minAttendanceRate: 80,
        requireFinalProject: true,
      },
    });
    programId = program.id;
    await prisma.leadershipProgramParticipant.create({
      data: { userId: employeeId, programId, status: 'IN_PROGRESS', attendanceRate: 85 },
    });
  });

  afterAll(async () => {
    if (programId) {
      const where = { programId };
      await prisma.certificate.deleteMany({ where }).catch(() => undefined);
      const participants = await prisma.leadershipProgramParticipant
        .findMany({ where, select: { id: true } })
        .catch(() => [] as { id: number }[]);
      const pIds = participants.map(p => p.id);
      await prisma.leadershipProject.deleteMany({ where }).catch(() => undefined);
      if (pIds.length) {
        await prisma.leadershipParticipantAssessment
          .deleteMany({ where: { participantId: { in: pIds } } })
          .catch(() => undefined);
      }
      await prisma.leadershipProgramParticipant.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgram
        .deleteMany({ where: { id: programId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  const complete = (token: string) =>
    request(app.getHttpServer())
      .post(`/leadership/programs/${programId}/participants/${employeeId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send();

  it('não-gestor → 403; gestor com critérios por cumprir → 400', async () => {
    await complete(employeeToken).expect(403);
    await complete(adminToken).expect(400);
  });

  it('depois de cumprir os critérios: conclui, emite 1 certificado LEADERSHIP e é idempotente', async () => {
    // Avaliação FINAL concluída (80/100 → 80%).
    await request(app.getHttpServer())
      .put(`/leadership/programs/${programId}/participants/${employeeId}/assessments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stage: 'FINAL',
        status: 'COMPLETED',
        score: 80,
        maxScore: 100,
        readinessLevel: 'READY_NOW',
      })
      .expect(200);

    // Projecto final avaliado.
    const project = await request(app.getHttpServer())
      .post(`/leadership/programs/${programId}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ participantUserId: employeeId, title: 'Projecto final' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/leadership/projects/${project.body.id}/evaluation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ score: 85, outcome: 'Aprovado' })
      .expect(200);

    const first = await complete(adminToken).expect(200);
    expect(first.body.participant.status).toBe('COMPLETED');
    expect(first.body.participant.readinessLevel).toBe('READY_NOW');
    expect(first.body.certificate).toMatchObject({
      type: 'LEADERSHIP',
      programId,
      userId: employeeId,
    });
    expect(first.body.alreadyCompleted).toBe(false);

    const second = await complete(adminToken).expect(200);
    expect(second.body.alreadyCompleted).toBe(true);

    const certCount = await prisma.certificate.count({
      where: { type: 'LEADERSHIP', programId, userId: employeeId, revoked: false },
    });
    expect(certCount).toBe(1);
  });

  it('outcomes: KPIs do programa (conclusão 100%, 1 certificado, readiness)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/leadership/programs/${programId}/outcomes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.participants.total).toBe(1);
    expect(res.body.participants.completionRate).toBe(100);
    expect(res.body.certificates.issued).toBe(1);
    expect(res.body.readiness.byLevel.READY_NOW).toBe(1);
    expect(res.body.roi).toBeNull();
  });
});
