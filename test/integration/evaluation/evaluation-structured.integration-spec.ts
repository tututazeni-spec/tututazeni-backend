// Avaliação de desempenho estruturada contra um Postgres real: confirma que as
// tabelas/colunas novas existem de facto (os mocks de Prisma não apanham
// divergência schema ↔ código) e que as permissões são aplicadas no backend.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Evaluation structured (pontos fortes / melhorias / recomendações)', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let auditorToken: string;
  let employeeId: number;
  let managerId: number;
  let campaignId: number;
  let formId: number;
  let requestId: number;
  let evaluationId: number;
  let recommendationId: number;
  let trainingId: number;
  let planId: number;
  let originalManagerId: number | null;
  const q: number[] = [];

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

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
    auditorToken = await getToken(app.getHttpServer(), 'auditor');
    employeeId = (await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    }))!.id;
    managerId = (await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    }))!.id;
    // O gestor tem de ser gestor directo do colaborador para ver o PDI dele.
    originalManagerId = (await prisma.user.findUnique({ where: { id: employeeId } }))!.managerId;
    await prisma.user.update({ where: { id: employeeId }, data: { managerId } });
    trainingId = (
      await prisma.training.create({
        data: {
          title: 'Int Gestão do Tempo',
          type: 'ONLINE',
          level: 'BEGINNER',
          status: 'PUBLISHED',
          createdById: managerId,
        },
      })
    ).id;

    const form = await prisma.evaluationCampaignForm.create({
      data: {
        title: 'Int Structured Form',
        createdById: managerId,
        questions: {
          create: [
            { text: 'Qualidade', type: 'SCALE', order: 1, weight: 30, scaleMax: 5 },
            { text: 'Resultados', type: 'SCALE', order: 2, weight: 70, scaleMax: 5 },
          ],
        },
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    formId = form.id;
    form.questions.forEach(x => q.push(x.id));
    const campaign = await prisma.evaluationCampaign.create({
      data: {
        name: 'Int Structured Campaign',
        model: 'DEG_360',
        status: 'DRAFT',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-01'),
        formId,
        createdById: managerId,
      },
    });
    campaignId = campaign.id;
    requestId = (
      await prisma.evaluationRequest.create({
        data: {
          evaluatorId: managerId,
          evaluatedId: employeeId,
          type: 'MANAGER',
          cycleId: campaignId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    // Filhos antes dos pais (FK RESTRICT); nunca filtrar por userId de logs de acesso.
    if (evaluationId) {
      await prisma.evaluationRecommendation
        .deleteMany({ where: { evaluationId } })
        .catch((): undefined => undefined);
      await prisma.evaluationImprovementArea
        .deleteMany({ where: { evaluationId } })
        .catch((): undefined => undefined);
      await prisma.evaluationStrength
        .deleteMany({ where: { evaluationId } })
        .catch((): undefined => undefined);
    }
    await prisma.performanceEvaluation
      .deleteMany({ where: { cycleId: campaignId } })
      .catch((): undefined => undefined);
    if (planId) {
      await prisma.developmentPlan
        .deleteMany({ where: { id: planId } })
        .catch((): undefined => undefined);
    }
    if (trainingId) {
      await prisma.training
        .deleteMany({ where: { id: trainingId } })
        .catch((): undefined => undefined);
    }
    await prisma.user
      .update({ where: { id: employeeId }, data: { managerId: originalManagerId } })
      .catch((): undefined => undefined);
    await prisma.evaluationRequest
      .deleteMany({ where: { id: requestId } })
      .catch((): undefined => undefined);
    await prisma.evaluationCampaign
      .deleteMany({ where: { id: campaignId } })
      .catch((): undefined => undefined);
    await prisma.evaluationCampaignForm
      .deleteMany({ where: { id: formId } })
      .catch((): undefined => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  const submit = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/evaluations/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ requestId, ...body });

  it('GET /evaluations/rating-scale devolve 5 níveis e faixas', async () => {
    const res = await request(app.getHttpServer())
      .get('/evaluations/rating-scale')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(res.body.levels.map((l: any) => l.value)).toEqual([1, 2, 3, 4, 5]);
    expect(res.body.bands).toHaveLength(5);
  });

  it('nota fora da escala → 400 com mensagens legíveis', async () => {
    const res = await submit(managerToken, {
      answers: [
        { questionId: q[0], score: 6 },
        { questionId: q[1], score: 3 },
      ],
    }).expect(400);
    expect(JSON.stringify(res.body)).toMatch(/entre 1 e 5/);
  });

  it('submissão final incompleta → 400 e nada fica concluído', async () => {
    await submit(managerToken, { answers: [{ questionId: q[0], score: 5 }] }).expect(400);
    const req = await prisma.evaluationRequest.findUnique({ where: { id: requestId } });
    expect(req!.status).not.toBe('COMPLETED');
  });

  it('só o avaliador atribuído submete', async () => {
    await submit(employeeToken, {
      answers: [
        { questionId: q[0], score: 5 },
        { questionId: q[1], score: 3 },
      ],
    }).expect(400);
  });

  it('rascunho incompleto guarda % sem classificação final', async () => {
    await submit(managerToken, {
      isDraft: true,
      answers: [{ questionId: q[0], score: 5 }],
    }).expect(201);
    const ev = await prisma.performanceEvaluation.findFirst({ where: { cycleId: campaignId } });
    evaluationId = ev!.id;
    expect(ev!.isDraft).toBe(true);
    expect(ev!.completionPct).toBe(50);
    expect(ev!.ratingLabel).toBeNull();
    expect(ev!.overallScore).toBe(0);
  });

  it('rascunho é invisível ao avaliado', async () => {
    await request(app.getHttpServer())
      .get(`/evaluations/performance/${evaluationId}/items`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(404);
  });

  it('itens inválidos → 400 (duplicado, nota 0, área inexistente na recomendação)', async () => {
    const res = await submit(managerToken, {
      answers: [
        { questionId: q[0], score: 5 },
        { questionId: q[1], score: 3 },
      ],
      strengthItems: [
        { competency: 'Equipa', score: 4, description: 'Colabora' },
        { competency: 'equipa', score: 4, description: 'Repetido' },
      ],
      recommendationItems: [
        {
          improvementRef: 'inexistente',
          action: 'Curso',
          objective: 'Melhorar',
          actionType: 'FORMACAO',
          successIndicator: '90%',
          priority: 3,
        },
      ],
    }).expect(400);
    expect(JSON.stringify(res.body)).toMatch(/duplicado/);
    await submit(managerToken, {
      answers: [],
      isDraft: true,
      strengthItems: [{ competency: 'X', score: 0, description: 'abc' }],
    }).expect(400);
  });

  it('submissão final persiste média ponderada, classificação e registos estruturados', async () => {
    await submit(managerToken, {
      answers: [
        { questionId: q[0], score: 5 },
        { questionId: q[1], score: 3 },
      ],
      strengthItems: [
        {
          competency: 'Qualidade do Trabalho',
          score: 5,
          description: 'Entrega sem erros',
          evidence: 'Zero defeitos no Q1',
        },
      ],
      improvementItems: [
        {
          ref: 'a1',
          competency: 'Cumprimento de prazos',
          score: 2,
          description: 'Atrasa entregas',
          priority: 'ALTA',
        },
      ],
      recommendationItems: [
        {
          improvementRef: 'a1',
          action: 'Formação em gestão do tempo',
          objective: 'Cumprir 90% dos prazos',
          actionType: 'FORMACAO',
          responsibleId: managerId,
          trainingId,
          successIndicator: '90% das entregas a tempo',
          priority: 4,
        },
      ],
    }).expect(201);

    const ev = await prisma.performanceEvaluation.findUnique({
      where: { id: evaluationId },
      include: {
        strengthItems: true,
        improvementItems: true,
        recommendationItems: true,
      },
    });
    // (5×30 + 3×70) / 100 = 3.6
    expect(ev!.overallScore).toBe(3.6);
    expect(ev!.ratingLabel).toBe('Muito bom');
    expect(ev!.completionPct).toBe(100);
    expect(ev!.isDraft).toBe(false);
    expect(ev!.strengthItems).toHaveLength(1);
    expect(ev!.improvementItems[0].priority).toBe('ALTA');
    expect(ev!.recommendationItems).toHaveLength(1);
    expect(ev!.recommendationItems[0].improvementAreaId).toBe(ev!.improvementItems[0].id);
    recommendationId = ev!.recommendationItems[0].id;
  });

  it('avaliação submetida é imutável → 409', async () => {
    await submit(managerToken, { answers: [], isDraft: true }).expect(409);
    await submit(managerToken, {
      answers: [
        { questionId: q[0], score: 1 },
        { questionId: q[1], score: 1 },
      ],
    }).expect(409);
  });

  it('avaliado e RH leem os registos; auditor sem relação não', async () => {
    const asEmployee = await request(app.getHttpServer())
      .get(`/evaluations/performance/${evaluationId}/items`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(asEmployee.body.strengths).toHaveLength(1);
    expect(asEmployee.body.recommendations[0].status).toBe('PENDENTE');
    await request(app.getHttpServer())
      .get(`/evaluations/performance/${evaluationId}/items`)
      .set('Authorization', `Bearer ${rhToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/evaluations/performance/${evaluationId}/items`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(404);
  });

  it('acompanhamento da recomendação: permissões, progresso e conclusão auditada', async () => {
    const url = `/evaluations/recommendations/${recommendationId}`;
    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'EM_CURSO' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'EM_CURSO', progressPct: 100 })
      .expect(400);
    const mid = await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'EM_CURSO', progressPct: 40, notes: 'Inscrito no curso' })
      .expect(200);
    expect(mid.body.progressPct).toBe(40);

    const done = await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'CONCLUIDA' })
      .expect(200);
    expect(done.body.progressPct).toBe(100);
    expect(done.body.completedAt).toBeTruthy();

    // Ação concluída só é reaberta por RH/Admin.
    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'EM_CURSO', progressPct: 10 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ status: 'EM_CURSO', progressPct: 10 })
      .expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: 'EvaluationRecommendation',
        entityId: recommendationId,
        action: 'RECOMMENDATION_COMPLETED',
      },
    });
    expect(audit).not.toBeNull();
  });

  it('recomendação com formação mostra a formação real e o estado do avaliado (sem inscrição criada)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/evaluations/performance/${evaluationId}/items`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const rec = res.body.recommendations[0];
    expect(rec.training).toMatchObject({ id: trainingId, title: 'Int Gestão do Tempo' });
    expect(rec.trainingParticipation).toBeNull();
    expect(
      await prisma.trainingParticipant.count({ where: { userId: employeeId, trainingId } }),
    ).toBe(0);
  });

  it('formação inexistente → 400', async () => {
    const other = await prisma.evaluationRequest.create({
      data: { evaluatorId: managerId, evaluatedId: employeeId, type: 'PEER', cycleId: campaignId },
    });
    try {
      await request(app.getHttpServer())
        .post('/evaluations/submit')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          requestId: other.id,
          isDraft: true,
          answers: [],
          recommendationItems: [
            {
              action: 'Curso',
              objective: 'Melhorar',
              actionType: 'FORMACAO',
              trainingId: 99999999,
              successIndicator: '90%',
              priority: 3,
            },
          ],
        })
        .expect(400);
    } finally {
      await prisma.evaluationRequest.deleteMany({ where: { id: other.id } });
    }
  });

  it('gerar PDI: só avaliador/RH; cria plano e liga as ações; segunda chamada recusada', async () => {
    const url = `/evaluations/performance/${evaluationId}/pdi`;
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(404);

    const res = await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    planId = res.body.planId;
    expect(res.body.actionsCreated).toBe(1);

    const ev = await prisma.performanceEvaluation.findUnique({ where: { id: evaluationId } });
    expect(ev!.pdiPlanId).toBe(planId);
    const plan = await prisma.developmentPlan.findUnique({
      where: { id: planId },
      include: { actions: true },
    });
    expect(plan!.userId).toBe(employeeId);
    expect(plan!.origin).toBe('PERFORMANCE_REVIEW');
    expect(plan!.actions).toHaveLength(1);
    expect(plan!.actions[0].type).toBe('COURSE');

    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(409);
  });

  it('com PDI ligado, o estado da recomendação vem do PDI e a edição direta é recusada', async () => {
    const recRow = await prisma.evaluationRecommendation.findUnique({
      where: { id: recommendationId },
    });
    expect(recRow!.pdiActionId).not.toBeNull();
    await request(app.getHttpServer())
      .patch(`/evaluations/recommendations/${recommendationId}`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ status: 'CONCLUIDA' })
      .expect(409);

    // Concluir a ação no PDI reflete-se na recomendação (fonte única de verdade).
    await prisma.developmentPlanAction.update({
      where: { id: recRow!.pdiActionId! },
      data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
    });
    const res = await request(app.getHttpServer())
      .get(`/evaluations/performance/${evaluationId}/items`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(res.body.pdiPlanId).toBe(planId);
    expect(res.body.recommendations[0]).toMatchObject({
      status: 'CONCLUIDA',
      progressPct: 100,
      source: 'PDI',
    });
  });

  it('histórico: o próprio e o gestor leem; auditor não; tipo inválido → 400', async () => {
    const url = `/evaluations/performance/history/${employeeId}`;
    const res = await request(app.getHttpServer())
      .get(url)
      .query({ type: 'MANAGER' })
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({
      overallScore: 3.6,
      ratingLabel: 'Muito bom',
      recommendations: { total: 1, done: 1 },
    });
    expect(res.body.comparison).toBeNull();
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(url)
      .query({ type: 'XPTO' })
      .set('Authorization', `Bearer ${rhToken}`)
      .expect(400);
  });

  const overview = (query: Record<string, unknown>, token = rhToken) =>
    request(app.getHttpServer())
      .get('/evaluations/reports/overview')
      .query({ cycleId: campaignId, ...query })
      .set('Authorization', `Bearer ${token}`);

  it('relatórios: com menos de 3 avaliações os agregados identificáveis ficam ocultos', async () => {
    const res = await overview({}).expect(200);
    expect(res.body.totalEvaluations).toBe(1);
    expect(res.body.privacy).toMatchObject({ minGroupSize: 3, restricted: true });
    expect(res.body.byDepartment).toEqual([]);
    expect(res.body.competencyGaps).toEqual([]);
    expect(res.body.performance).toMatchObject({
      restricted: true,
      byRating: [],
      topStrengths: [],
      recurringImprovements: [],
    });
    // Totais de recomendações continuam disponíveis (não identificam pessoas).
    expect(res.body.performance.recommendations).toMatchObject({
      total: 1,
      trainingNeeds: 1,
      byStatus: { CONCLUIDA: 1 },
    });
    expect(res.body.performance.pdi.plans).toBe(1);
    await overview({}, employeeToken).expect(403);
  });

  it('relatórios: com 3 ou mais avaliações mostra indicadores; filtros por tipo e estado', async () => {
    for (const period of ['2026-A', '2026-B']) {
      await prisma.performanceEvaluation.create({
        data: {
          evaluatorId: managerId,
          evaluatedId: employeeId,
          type: 'PEER',
          period,
          criteria: [],
          cycleId: campaignId,
          isDraft: false,
          overallScore: 3,
          ratingLabel: 'Bom',
          completionPct: 100,
          strengthItems: {
            create: [{ competency: 'Qualidade do Trabalho', score: 4, description: 'Rigor' }],
          },
        },
      });
    }
    const all = await overview({}).expect(200);
    expect(all.body.totalEvaluations).toBe(3);
    expect(all.body.privacy.restricted).toBe(false);
    expect(all.body.performance.byRating).toEqual(
      expect.arrayContaining([
        { label: 'Muito bom', count: 1 },
        { label: 'Bom', count: 2 },
      ]),
    );
    expect(all.body.performance.topStrengths[0]).toMatchObject({
      competency: 'Qualidade do Trabalho',
      count: 3,
    });
    expect(all.body.performance.recurringImprovements[0].competency).toBe('Cumprimento de prazos');

    // Um único colaborador avaliado 3 vezes forma um grupo de 3 avaliações: aparece.
    // O filtro por tipo reduz-se a 1 avaliação → volta a ficar restrito.
    const manager = await overview({ type: 'MANAGER' }).expect(200);
    expect(manager.body.totalEvaluations).toBe(1);
    expect(manager.body.performance.restricted).toBe(true);
    const peer = await overview({ type: 'PEER' }).expect(200);
    expect(peer.body.totalEvaluations).toBe(2);

    // Filtro de estado das recomendações (efectivo, vindo do PDI).
    const done = await overview({ recommendationStatus: 'CONCLUIDA' }).expect(200);
    expect(done.body.performance.recommendations.total).toBe(1);
    const pending = await overview({ recommendationStatus: 'PENDENTE' }).expect(200);
    expect(pending.body.performance.recommendations.total).toBe(0);

    await overview({ type: 'XPTO' }).expect(400);
    await overview({ recommendationStatus: 'XPTO' }).expect(400);
  });

  it('relatórios: a chefia só vê a sua equipa direta e não exporta', async () => {
    const own = await overview({}, managerToken).expect(200);
    expect(own.body.totalEvaluations).toBe(3);
    expect(own.body.privacy.minGroupSize).toBe(3);

    // O filtro de gestor vindo do cliente é ignorado: não dá para ver outra equipa.
    const spoof = await overview({ managerId: 99999999 }, managerToken).expect(200);
    expect(spoof.body.totalEvaluations).toBe(3);

    // Sem subordinados diretos com avaliações, o relatório vem vazio.
    await prisma.user.update({ where: { id: employeeId }, data: { managerId: null } });
    try {
      const empty = await overview({}, managerToken).expect(200);
      expect(empty.body.totalEvaluations).toBe(0);
      expect(empty.body.completionRate).toBe(0);
    } finally {
      await prisma.user.update({ where: { id: employeeId }, data: { managerId } });
    }

    // Exportações e o filtro de gestor continuam a ser de ADMIN/RH.
    await request(app.getHttpServer())
      .get('/evaluations/reports/export.csv')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
    const asRh = await overview({ managerId: 99999999 }, rhToken).expect(200);
    expect(asRh.body.totalEvaluations).toBe(0);
  });

  it('formulário com pesos explícitos que não somam 100% → 400', async () => {
    await request(app.getHttpServer())
      .post('/evaluations/forms')
      .set('Authorization', `Bearer ${rhToken}`)
      .send({
        title: 'Pesos errados',
        questions: [
          { text: 'A', type: 'SCALE', weight: 60 },
          { text: 'B', type: 'SCALE', weight: 30 },
        ],
      })
      .expect(400);
  });
});
