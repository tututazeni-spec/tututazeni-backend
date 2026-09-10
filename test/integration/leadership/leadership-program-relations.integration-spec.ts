import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// Exercita `PUT /leadership/programs/:id/configuration` (replaceConfiguration —
// Task 4) ponta-a-ponta contra o PostgreSQL de teste: validação de referências
// canónicas, deduplicação, somatório de pesos e o agregado de configuração
// devolvido no detalhe do programa. É esta classe de teste que apanha
// divergências schema ↔ código — os unitários fazem mock do PrismaService.
describe('Leadership Program Relations (integração)', () => {
  let app: INestApplication;
  let adminToken: string;
  let managerToken: string;
  let managerId: number;
  let adminId: number;
  let departmentId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const CODE = `LDR-RELATIONS-${Date.now()}`;
  const COMPETENCY_NAME = 'Relações Integração — Competência';
  const PATH_TITLE = 'Relações Integração — Trilha';

  let programId: number;
  let courseId: number;
  let competencyId: number;
  let learningPathId: number;

  const configUrl = () => `/leadership/programs/${programId}/configuration`;

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

    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    const admin = await prisma.user.findUnique({ where: { email: 'int.admin@innova-test.com' } });
    managerId = manager!.id;
    adminId = admin!.id;
    departmentId = manager!.departmentId!;

    const course = await prisma.course.findUnique({ where: { internalCode: 'INT-TEST-001' } });
    courseId = course!.id;

    const competency = await prisma.competency.upsert({
      where: { name: COMPETENCY_NAME },
      update: {},
      create: { name: COMPETENCY_NAME, category: 'LEADERSHIP', type: 'LEADERSHIP', scaleMax: 5 },
    });
    competencyId = competency.id;

    const path = await prisma.learningPath.create({ data: { title: PATH_TITLE } });
    learningPathId = path.id;

    const program = await prisma.leadershipProgram.create({
      data: {
        code: CODE,
        name: 'Programa Relações',
        level: 'INITIAL',
        createdById: adminId,
      },
    });
    programId = program.id;
  });

  afterAll(async () => {
    // FK: as linhas de config têm onDelete: Cascade sobre o programa, mas
    // limpam-se explicitamente (convenção test/integration/teardown.ts) antes do
    // pai. Cada passo com .catch.
    if (programId) {
      const where = { programId };
      await prisma.leadershipProgramAdvisor.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramMethodology.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramContent.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramObjective.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramCompetency.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipSelectionCriterion.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramTargeting.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgram
        .deleteMany({ where: { id: programId } })
        .catch(() => undefined);
    }
    if (learningPathId) {
      await prisma.learningPath
        .deleteMany({ where: { id: learningPathId } })
        .catch(() => undefined);
    }
    await prisma.competency.deleteMany({ where: { name: COMPETENCY_NAME } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  const validConfig = () => ({
    objectives: [{ title: 'Reduzir turnover', type: 'BUSINESS', indicator: 'Turnover anual' }],
    targeting: [{ scope: 'DEPARTMENT', departmentId }],
    selectionCriteria: [
      { name: 'Desempenho', source: 'PERFORMANCE_REVIEW', weight: 60 },
      { name: 'Competência', source: 'COMPETENCY_ASSESSMENT', weight: 40, competencyId },
    ],
    competencies: [{ competencyId, baselineLevel: 2, targetLevel: 4, weight: 100 }],
    contents: [
      { contentType: 'COURSE', courseId, seq: 0 },
      { contentType: 'LEARNING_PATH', learningPathId, seq: 1 },
    ],
    methodologies: [
      { type: 'WORKSHOP', weight: 60, hours: 24 },
      { type: 'MENTORING', weight: 40, hours: 16 },
    ],
    advisors: [{ userId: managerId, role: 'MENTOR', focusArea: 'Gestão de equipas' }],
  });

  it('gestor sem ownership do programa → 403', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${managerToken}`)
      .send(validConfig())
      .expect(403);
  });

  it('courseId inexistente → 404', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contents: [{ contentType: 'COURSE', courseId: 99999999 }] })
      .expect(404);
  });

  it('competencyId inexistente → 404', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ competencies: [{ competencyId: 99999999, targetLevel: 4 }] })
      .expect(404);
  });

  it('competência associada duas vezes → 400', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        competencies: [
          { competencyId, targetLevel: 4 },
          { competencyId, targetLevel: 2 },
        ],
      })
      .expect(400);
  });

  it('pesos das metodologias ≠ 100 → 400', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        methodologies: [
          { type: 'COACHING', weight: 40 },
          { type: 'MENTORING', weight: 40 },
        ],
      })
      .expect(400);
  });

  it('pesos dos critérios de selecção activos ≠ 100 → 400', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        selectionCriteria: [
          { name: 'A', source: 'PERFORMANCE_REVIEW', weight: 30 },
          { name: 'B', source: 'LEADERSHIP_SCORE', weight: 30 },
        ],
      })
      .expect(400);
  });

  it('conteúdo COURSE sem courseId → 400', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contents: [{ contentType: 'COURSE' }] })
      .expect(400);

    // Nenhuma das tentativas falhadas acima deixou config persistida.
    const detail = await request(app.getHttpServer())
      .get(`/leadership/programs/${programId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.contents).toHaveLength(0);
    expect(detail.body.selectionCriteria).toHaveLength(0);
    expect(detail.body.competencies).toHaveLength(0);
  });

  it('config válida → 200 e o detalhe do programa devolve o agregado completo', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validConfig())
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/leadership/programs/${programId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = detail.body;
    expect(body.objectives).toHaveLength(1);
    expect(body.targeting).toHaveLength(1);
    expect(body.targeting[0]).toMatchObject({ scope: 'DEPARTMENT', departmentId });

    expect(body.selectionCriteria).toHaveLength(2);
    const compCriterion = body.selectionCriteria.find((c: any) => c.competencyId === competencyId);
    expect(compCriterion.competency).toMatchObject({ id: competencyId, name: COMPETENCY_NAME });

    expect(body.competencies).toHaveLength(1);
    expect(body.competencies[0].competency).toMatchObject({ id: competencyId });
    expect(Number(body.competencies[0].targetLevel)).toBe(4);

    expect(body.contents).toHaveLength(2);
    const courseContent = body.contents.find((c: any) => c.contentType === 'COURSE');
    expect(courseContent.course).toMatchObject({ id: courseId });
    const pathContent = body.contents.find((c: any) => c.contentType === 'LEARNING_PATH');
    expect(pathContent.learningPath).toMatchObject({ id: learningPathId, title: PATH_TITLE });

    expect(body.methodologies).toHaveLength(2);
    expect(body.advisors).toHaveLength(1);
    expect(body.advisors[0]).toMatchObject({ userId: managerId, role: 'MENTOR' });
    expect(body.advisors[0].user).toMatchObject({ id: managerId });
  });

  it('novo replace substitui a configuração (delete-all + recreate)', async () => {
    await request(app.getHttpServer())
      .put(configUrl())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        objectives: [{ title: 'Único objectivo agora' }],
        methodologies: [{ type: 'COACHING', weight: 100 }],
      })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/leadership/programs/${programId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detail.body.objectives).toHaveLength(1);
    expect(detail.body.objectives[0].title).toBe('Único objectivo agora');
    expect(detail.body.methodologies).toHaveLength(1);
    // Tudo o que não veio no novo payload foi removido.
    expect(detail.body.selectionCriteria).toHaveLength(0);
    expect(detail.body.competencies).toHaveLength(0);
    expect(detail.body.contents).toHaveLength(0);
    expect(detail.body.advisors).toHaveLength(0);
    expect(detail.body.targeting).toHaveLength(0);
  });
});
