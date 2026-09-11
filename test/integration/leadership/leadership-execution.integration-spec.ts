import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// Execução do programa (Task 5, parte 2) ponta-a-ponta: avaliações por etapa,
// projecto de liderança + avaliação, documento por referência, custos + resumo,
// e dispatch idempotente de comunicações.
describe('Leadership Execution (integração)', () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeId: number;
  let managerId: number;
  let adminId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const CODE = `LDR-EXEC-${Date.now()}`;
  let programId: number;
  let documentId: number;

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
      data: { code: CODE, name: 'Programa Execução', level: 'INITIAL', createdById: adminId },
    });
    programId = program.id;
    await prisma.leadershipProgramParticipant.create({
      data: { userId: employeeId, programId, status: 'IN_PROGRESS' },
    });

    const doc = await prisma.document.create({
      data: {
        title: 'Syllabus Liderança Execução',
        category: 'LEARNING',
        fileUrl: 'https://ci.innova.test/syllabus-exec.pdf',
        mimeType: 'application/pdf',
        createdById: adminId,
      },
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    if (programId) {
      const where = { programId };
      const participants = await prisma.leadershipProgramParticipant
        .findMany({ where, select: { id: true } })
        .catch(() => [] as { id: number }[]);
      const pIds = participants.map(p => p.id);
      await prisma.leadershipProgramCommunication.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramDocument.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramCost.deleteMany({ where }).catch(() => undefined);
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
    if (documentId) {
      await prisma.document.deleteMany({ where: { id: documentId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  const P = () => `/leadership/programs/${programId}`;

  it('avaliação: uma linha por etapa (segundo PUT actualiza, não duplica)', async () => {
    await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/assessments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage: 'INITIAL', score: 60, maxScore: 100 })
      .expect(200);

    const second = await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/assessments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage: 'INITIAL', status: 'COMPLETED', score: 72 })
      .expect(200);
    expect(Number(second.body.score)).toBe(72);
    expect(second.body.assessedAt).toBeTruthy();

    const count = await prisma.leadershipParticipantAssessment.count({
      where: { participant: { programId }, stage: 'INITIAL' },
    });
    expect(count).toBe(1);
  });

  it('projecto: criar, depois avaliar (estado inválido → 400)', async () => {
    const created = await request(app.getHttpServer())
      .post(`${P()}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        participantUserId: employeeId,
        title: 'Reduzir tempo de ciclo',
        kpiName: 'Lead time',
        kpiTarget: '-20%',
        sponsorId: managerId,
      })
      .expect(201);
    const projectId = created.body.id;

    await request(app.getHttpServer())
      .patch(`/leadership/projects/${projectId}/evaluation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROPOSED' })
      .expect(400);

    const evaluated = await request(app.getHttpServer())
      .patch(`/leadership/projects/${projectId}/evaluation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ score: 85, outcome: 'Meta atingida' })
      .expect(200);
    expect(evaluated.body.status).toBe('COMPLETED');
    expect(evaluated.body.evaluatedById).toBe(adminId);
  });

  it('documento: referência a Document existente; inexistente → 404', async () => {
    await request(app.getHttpServer())
      .post(`${P()}/documents`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ documentId: 99999999, kind: 'SYLLABUS' })
      .expect(404);

    const ref = await request(app.getHttpServer())
      .post(`${P()}/documents`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ documentId, kind: 'SYLLABUS' })
      .expect(201);
    expect(ref.body.documentId).toBe(documentId);
    expect(ref.body.uploadedById).toBe(adminId);
  });

  it('custos: resumo agrega planeado/real/variação por categoria', async () => {
    await request(app.getHttpServer())
      .post(`${P()}/costs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ category: 'INSTRUCTOR', plannedAmount: 1000, actualAmount: 900 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${P()}/costs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ category: 'VENUE', plannedAmount: 400, actualAmount: 450 })
      .expect(201);

    const summary = await request(app.getHttpServer())
      .get(`${P()}/costs/summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summary.body.totalPlanned).toBe(1400);
    expect(summary.body.totalActual).toBe(1350);
    expect(summary.body.variance).toBe(50);
    expect(summary.body.byCategory.INSTRUCTOR).toEqual({ planned: 1000, actual: 900 });
  });

  it('comunicação: dispatch idempotente (segundo dispatch não re-reivindica)', async () => {
    const scheduled = await request(app.getHttpServer())
      .post(`${P()}/communications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ event: 'SESSION_REMINDER', subject: 'Sessão amanhã', body: 'Não faltes' })
      .expect(201);
    const commId = scheduled.body.id;
    expect(scheduled.body.status).toBe('SCHEDULED');

    const first = await request(app.getHttpServer())
      .post(`/leadership/communications/${commId}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send()
      .expect(200);
    expect(first.body.status).toBe('SENT');
    const sentAt = first.body.sentAt;
    expect(sentAt).toBeTruthy();

    const second = await request(app.getHttpServer())
      .post(`/leadership/communications/${commId}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send()
      .expect(200);
    expect(second.body.status).toBe('SENT');
    // Claim atómico: o segundo dispatch não voltou a mover a linha.
    expect(second.body.sentAt).toBe(sentAt);
  });
});
