import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// Percurso do participante (Task 5, parte 1) ponta-a-ponta: baseline, mentor/
// coach, ligação ao PDI e ao mentoring canónicos, e leitura self-only.
describe('Leadership Participants (integração)', () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: number;
  let managerId: number;
  let adminId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const CODE = `LDR-PART-${Date.now()}`;
  let programId: number;
  let planId: number;
  let mentoringId: number;
  let otherPlanId: number;

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
      data: { code: CODE, name: 'Programa Participantes', level: 'INITIAL', createdById: adminId },
    });
    programId = program.id;
    await prisma.leadershipProgramParticipant.create({
      data: { userId: employeeId, programId, status: 'ENROLLED' },
    });

    const plan = await prisma.developmentPlan.create({
      data: { name: 'PDI do colaborador', goal: 'Crescer em liderança', userId: employeeId },
    });
    planId = plan.id;

    const otherPlan = await prisma.developmentPlan.create({
      data: { name: 'PDI de outro', goal: 'x', userId: managerId },
    });
    otherPlanId = otherPlan.id;

    const mentoring = await prisma.mentoring.create({
      data: { mentorId: managerId, menteeId: employeeId, objective: 'Liderança' },
    });
    mentoringId = mentoring.id;
  });

  afterAll(async () => {
    if (programId) {
      const where = { programId };
      const participants = await prisma.leadershipProgramParticipant
        .findMany({ where, select: { id: true } })
        .catch(() => [] as { id: number }[]);
      const pIds = participants.map(p => p.id);
      if (pIds.length) {
        const plans = await prisma.leadershipParticipantPlan
          .findMany({ where: { participantId: { in: pIds } }, select: { id: true } })
          .catch(() => [] as { id: number }[]);
        await prisma.leadershipParticipantPlanAction
          .deleteMany({ where: { planId: { in: plans.map(p => p.id) } } })
          .catch(() => undefined);
        await prisma.leadershipParticipantPlan
          .deleteMany({ where: { participantId: { in: pIds } } })
          .catch(() => undefined);
      }
      await prisma.leadershipProgramParticipant.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgram
        .deleteMany({ where: { id: programId } })
        .catch(() => undefined);
    }
    await prisma.mentoring
      .deleteMany({ where: { id: { in: [mentoringId].filter(Boolean) } } })
      .catch(() => undefined);
    await prisma.developmentPlan
      .deleteMany({ where: { id: { in: [planId, otherPlanId].filter(Boolean) } } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  const P = () => `/leadership/programs/${programId}`;

  it('baseline: só gestão do programa; grava readiness', async () => {
    await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/baseline`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ baselineScore: 50 })
      .expect(403);

    const res = await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/baseline`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ baselineScore: 55, readinessLevel: 'NEEDS_DEVELOPMENT' })
      .expect(200);
    expect(Number(res.body.baselineScore)).toBe(55);
    expect(res.body.readinessLevel).toBe('NEEDS_DEVELOPMENT');
    expect(res.body.baselineCapturedAt).toBeTruthy();
  });

  it('advisors: mentoring de outro mentee → 400; mentoring correcto → aceite', async () => {
    const other = await prisma.mentoring.create({
      data: { mentorId: adminId, menteeId: managerId, objective: 'x' },
    });
    await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/advisors`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mentoringId: other.id })
      .expect(400);
    await prisma.mentoring.delete({ where: { id: other.id } });

    const res = await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/advisors`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mentorId: managerId, mentoringId })
      .expect(200);
    expect(res.body.mentorId).toBe(managerId);
    expect(res.body.mentoringId).toBe(mentoringId);
  });

  it('PDI: plano de outro utilizador → 400; plano do participante → liga', async () => {
    await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/development-plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ developmentPlanId: otherPlanId })
      .expect(400);

    const linked = await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/development-plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ developmentPlanId: planId, title: 'Percurso individual' })
      .expect(200);
    expect(linked.body.developmentPlanId).toBe(planId);

    const withActions = await request(app.getHttpServer())
      .put(`${P()}/participants/${employeeId}/plan-actions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        actions: [
          { title: 'Concluir curso base', type: 'COURSE' },
          { title: 'Sessão de coaching', type: 'COACHING' },
        ],
      })
      .expect(200);
    expect(withActions.body.actions).toHaveLength(2);
    expect(withActions.body.actions[0].seq).toBe(0);
  });

  it('self-only: o participante vê o seu percurso, mas não o de outro', async () => {
    const mine = await request(app.getHttpServer())
      .get(`${P()}/my-participation`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(mine.body.userId).toBe(employeeId);
    expect(mine.body.plan.developmentPlanId).toBe(planId);

    // Não existe rota para "o participante lê outro participante"; a rota de
    // gestão exige role e ownership.
    await request(app.getHttpServer())
      .get(`${P()}/participants/${managerId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });
});
