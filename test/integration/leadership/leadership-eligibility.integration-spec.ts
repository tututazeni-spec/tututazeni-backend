import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// Exercita o motor de elegibilidade (LeadershipEligibilityService.calculate)
// ponta-a-ponta contra o PostgreSQL de teste, através dos endpoints reais. É
// esta classe de teste que apanha divergências schema ↔ código — os unitários
// fazem mock do PrismaService.
describe('Leadership Eligibility (integração)', () => {
  let app: INestApplication;
  let adminToken: string;
  let managerToken: string;
  let employeeId: number;
  let managerId: number;
  let adminId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const CODE_MAIN = `LDR-ELIG-${Date.now()}`;
  const CODE_MANUAL = `LDR-ELIG-MAN-${Date.now()}`;
  const COMPETENCY_NAME = 'Elegibilidade Integração Competência';

  let mainProgramId: number;
  let manualProgramId: number;
  let cycleId: number;
  let reviewId: number;
  let competencyId: number;
  let userCompetencyId: number;

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
    managerToken = await getToken(app.getHttpServer(), 'manager');

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

    // ─── Fixtures de dados canónicos para o colaborador ────────────────────
    const cycle = await prisma.performanceCycle.create({
      data: {
        name: 'Ciclo Elegibilidade Integração',
        type: 'ANNUAL',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        scoreScale: 5,
      },
    });
    cycleId = cycle.id;

    const review = await prisma.performanceReview.create({
      data: {
        userId: employeeId,
        cycleId,
        type: 'MANAGER',
        score: 4, // 4/5 → 80
        potentialScore: 3, // 3/3 → 100
      },
    });
    reviewId = review.id;

    const competency = await prisma.competency.upsert({
      where: { name: COMPETENCY_NAME },
      update: {},
      create: { name: COMPETENCY_NAME, category: 'LEADERSHIP', type: 'LEADERSHIP', scaleMax: 5 },
    });
    competencyId = competency.id;

    const uc = await prisma.userCompetency.upsert({
      where: { userId_competencyId: { userId: employeeId, competencyId } },
      update: { currentLevel: 4 },
      create: { userId: employeeId, competencyId, currentLevel: 4 }, // 4/5 → 80
    });
    userCompetencyId = uc.id;

    // ─── Programa principal (autor = admin) + critérios (pesos somam 100) ──
    const mainProgram = await prisma.leadershipProgram.create({
      data: {
        code: CODE_MAIN,
        name: 'Programa Elegibilidade',
        level: 'INITIAL',
        createdById: adminId,
      },
    });
    mainProgramId = mainProgram.id;
    await prisma.leadershipSelectionCriterion.createMany({
      data: [
        {
          programId: mainProgramId,
          name: 'Desempenho',
          source: 'PERFORMANCE_REVIEW',
          weight: 40,
          seq: 0,
        },
        {
          programId: mainProgramId,
          name: 'Potencial',
          source: 'NINE_BOX_POTENTIAL',
          weight: 30,
          seq: 1,
        },
        {
          programId: mainProgramId,
          name: 'Competência de liderança',
          source: 'COMPETENCY_ASSESSMENT',
          weight: 30,
          competencyId,
          seq: 2,
        },
      ],
    });

    // ─── Programa com um único critério MANUAL ────────────────────────────
    const manualProgram = await prisma.leadershipProgram.create({
      data: { code: CODE_MANUAL, name: 'Programa Manual', level: 'INITIAL', createdById: adminId },
    });
    manualProgramId = manualProgram.id;
    await prisma.leadershipSelectionCriterion.create({
      data: {
        programId: manualProgramId,
        name: 'Entrevista',
        source: 'MANUAL',
        weight: 100,
        seq: 0,
      },
    });
  });

  afterAll(async () => {
    const programIds = [mainProgramId, manualProgramId].filter(Boolean);
    if (programIds.length) {
      const where = { programId: { in: programIds } };
      await prisma.leadershipProgramParticipant.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipSelectionCriterion.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgram
        .deleteMany({ where: { id: { in: programIds } } })
        .catch(() => undefined);
    }
    if (userCompetencyId) {
      await prisma.userCompetency
        .deleteMany({ where: { id: userCompetencyId } })
        .catch(() => undefined);
    }
    await prisma.competency.deleteMany({ where: { name: COMPETENCY_NAME } }).catch(() => undefined);
    if (reviewId) {
      await prisma.performanceReview.deleteMany({ where: { id: reviewId } }).catch(() => undefined);
    }
    if (cycleId) {
      await prisma.performanceCycle.deleteMany({ where: { id: cycleId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  it('gestor sem ownership do programa → 403 ao recalcular', async () => {
    await request(app.getHttpServer())
      .post(`/leadership/programs/${mainProgramId}/candidates/${employeeId}/recalculate`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(403);
  });

  it('admin recalcula → score determinístico a partir dos dados reais + persiste snapshot', async () => {
    const res = await request(app.getHttpServer())
      .post(`/leadership/programs/${mainProgramId}/candidates/${employeeId}/recalculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    // (40*80 + 30*100 + 30*80) / 100 = 86
    expect(res.body.score).toBe(86);
    expect(res.body.eligible).toBe(true);
    expect(res.body.breakdown).toHaveLength(3);
    expect(res.body.missingData).toEqual([]);
    const perf = res.body.breakdown.find((b: any) => b.source === 'PERFORMANCE_REVIEW');
    expect(perf.normalizedValue).toBe(80);
    expect(perf.rawValue).toBe(4);

    const participant = await prisma.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId: employeeId, programId: mainProgramId } },
    });
    expect(participant).toBeTruthy();
    expect(participant!.status).toBe('CANDIDATE');
    expect(Number(participant!.eligibilityScore)).toBe(86);
    expect(participant!.eligibilityComputedAt).toBeInstanceOf(Date);
    expect(JSON.parse(participant!.eligibilityBreakdown!)).toHaveLength(3);
    expect(JSON.parse(participant!.eligibilityMissingData!)).toEqual([]);
  });

  it('admin lista candidatos com a elegibilidade persistida', async () => {
    const res = await request(app.getHttpServer())
      .get(`/leadership/programs/${mainProgramId}/candidates`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const row = res.body.find((c: any) => c.userId === employeeId);
    expect(row).toBeTruthy();
    expect(Number(row.eligibilityScore)).toBe(86);
    expect(Array.isArray(row.eligibilityBreakdown)).toBe(true);
  });

  it('MANUAL sem valor → dado ausente explícito; com valor → usa-o', async () => {
    const missing = await request(app.getHttpServer())
      .post(`/leadership/programs/${manualProgramId}/candidates/${employeeId}/recalculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    expect(missing.body.score).toBe(0);
    expect(missing.body.eligible).toBe(false);
    expect(missing.body.missingData).toContain('MANUAL:Entrevista');
    expect(missing.body.breakdown[0].missing).toBe(true);

    const supplied = await request(app.getHttpServer())
      .post(`/leadership/programs/${manualProgramId}/candidates/${employeeId}/recalculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ manualValues: { Entrevista: 90 } })
      .expect(200);
    expect(supplied.body.score).toBe(90);
    expect(supplied.body.missingData).toEqual([]);
  });

  it('fluxo de selecção: select → INVITED; transição ilegal → 400', async () => {
    const selected = await request(app.getHttpServer())
      .post(`/leadership/programs/${mainProgramId}/candidates/${employeeId}/select`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send()
      .expect(200);
    expect(selected.body.status).toBe('SELECTED');

    const afterSelect = await prisma.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId: employeeId, programId: mainProgramId } },
    });
    expect(afterSelect!.selectedById).toBe(adminId);
    expect(afterSelect!.selectedAt).toBeInstanceOf(Date);

    const invited = await request(app.getHttpServer())
      .patch(`/leadership/programs/${mainProgramId}/participants/${employeeId}/selection-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INVITED' })
      .expect(200);
    expect(invited.body.status).toBe('INVITED');
    expect(invited.body.invitedAt).toBeTruthy();

    // INVITED → COMPLETED não é uma transição válida
    await request(app.getHttpServer())
      .patch(`/leadership/programs/${mainProgramId}/participants/${employeeId}/selection-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(400);
  });
});
