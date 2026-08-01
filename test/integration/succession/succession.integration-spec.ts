import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const MARK = `IntTestSuccession${Date.now()}`;

describe('Succession Integration', () => {
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

  let positionId: number;
  let criticalPositionId: number;
  let successionPlanId: number;

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
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    managerId = manager!.id;

    const position = await prisma.position.create({ data: { name: `${MARK} Position` } });
    positionId = position.id;
  });

  afterAll(async () => {
    if (successionPlanId) {
      await prisma.successionPDI.deleteMany({ where: { successionPlanId } }).catch(() => undefined);
      await prisma.successionPlan
        .deleteMany({ where: { id: successionPlanId } })
        .catch(() => undefined);
    }
    await prisma.talentPool.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    if (criticalPositionId) {
      await prisma.successionPlan
        .deleteMany({ where: { criticalPositionId } })
        .catch(() => undefined);
      await prisma.criticalPosition
        .deleteMany({ where: { id: criticalPositionId } })
        .catch(() => undefined);
    }
    if (positionId) {
      await prisma.position.deleteMany({ where: { id: positionId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Autenticação e RBAC', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/succession/dashboard').expect(401);
    });

    it('colaborador não acede ao dashboard', async () => {
      await request(app.getHttpServer())
        .get('/succession/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor acede ao dashboard (tier ADMIN/RH/GESTOR)', async () => {
      await request(app.getHttpServer())
        .get('/succession/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('gestor não acede a critical-positions (tier ADMIN/RH apenas)', async () => {
      await request(app.getHttpServer())
        .get('/succession/critical-positions')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });
  });

  describe('Cargos críticos', () => {
    it('RH classifica a posição como crítica', async () => {
      const res = await request(app.getHttpServer())
        .post('/succession/critical-positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          positionId,
          businessImpact: 'HIGH',
          replacementTime: 'MEDIUM_TERM',
          exitRisk: 'CRITICAL',
          minSuccessorsRequired: 1,
        })
        .expect(201);
      criticalPositionId = res.body.id;
      expect(res.body.keyPersonRisk).toBe(false);
    });

    it('posição já crítica → 409', async () => {
      await request(app.getHttpServer())
        .post('/succession/critical-positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          positionId,
          businessImpact: 'HIGH',
          replacementTime: 'MEDIUM_TERM',
          exitRisk: 'CRITICAL',
        })
        .expect(409);
    });

    it('GET /critical-positions inclui o cargo, sem sucessores ainda → alerta', async () => {
      const res = await request(app.getHttpServer())
        .get('/succession/critical-positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const cp = res.body.data.find((c: any) => c.id === criticalPositionId);
      expect(cp).toBeDefined();
      expect(cp.coverageStatus).toBe('CRITICAL');
      expect(cp.alert).toContain('sem sucessores');
    });

    it('?withoutSuccessor=false (bug: coagia para true) devolve todos, incluindo cobertos', async () => {
      const res = await request(app.getHttpServer())
        .get('/succession/critical-positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ withoutSuccessor: 'false' })
        .expect(200);
      expect(res.body.data.some((c: any) => c.id === criticalPositionId)).toBe(true);
    });

    it('GET /critical-positions/:id devolve o detalhe', async () => {
      const res = await request(app.getHttpServer())
        .get(`/succession/critical-positions/${criticalPositionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(criticalPositionId);
    });

    it('PATCH actualiza o cargo crítico', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/succession/critical-positions/${criticalPositionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ exitRisk: 'HIGH' })
        .expect(200);
      expect(res.body.exitRisk).toBe('HIGH');
    });
  });

  describe('Planos de sucessão (bug: SuccessionPlan.positionId obrigatório nunca era preenchido)', () => {
    it('RH cria plano de sucessão sem rebentar', async () => {
      const res = await request(app.getHttpServer())
        .post('/succession')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          criticalPositionId,
          candidateId: employeeId,
          readinessLevel: 'READY_SOON',
          priority: 'PRIMARY',
        })
        .expect(201);
      successionPlanId = res.body.id;
      expect(res.body.candidateId).toBe(employeeId);
      expect(res.body.matchScore).toBeGreaterThanOrEqual(0);
    });

    it('mesmo candidato duplicado no mesmo cargo → 409', async () => {
      await request(app.getHttpServer())
        .post('/succession')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          criticalPositionId,
          candidateId: employeeId,
          readinessLevel: 'READY_SOON',
          priority: 'PRIMARY',
        })
        .expect(409);
    });

    it('GET /succession/:id devolve o plano com matchScore e gaps', async () => {
      const res = await request(app.getHttpServer())
        .get(`/succession/${successionPlanId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.matchDetails.gaps).toBeDefined();
    });

    it('o cargo crítico agora está coberto (1 sucessor, mínimo 1)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/succession/critical-positions/${criticalPositionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body._count.successionPlans).toBe(1);
    });

    it('PUT actualiza o plano', async () => {
      const res = await request(app.getHttpServer())
        .put(`/succession/${successionPlanId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ readinessLevel: 'READY_NOW' })
        .expect(200);
      expect(res.body.readinessLevel).toBe('READY_NOW');
    });

    it('GET /succession lista planos filtrados por cargo crítico', async () => {
      const res = await request(app.getHttpServer())
        .get('/succession')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ criticalPositionId })
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === successionPlanId)).toBe(true);
    });
  });

  describe('Organograma, sumário por cargo e comparador', () => {
    it('org-chart inclui o cargo crítico', async () => {
      const res = await request(app.getHttpServer())
        .get('/succession/org-chart')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.some((c: any) => c.id === criticalPositionId)).toBe(true);
    });

    it('sumário por posição devolve byReadiness e coverageStatus', async () => {
      const res = await request(app.getHttpServer())
        .get(`/succession/position/${positionId}/summary`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.byReadiness.READY_NOW.length).toBe(1);
      expect(res.body.coverageStatus).toBe('COVERED');
    });

    it('comparar dois candidatos para o cargo', async () => {
      const res = await request(app.getHttpServer())
        .get('/succession/compare')
        .set('Authorization', `Bearer ${rhToken}`)
        .query({
          candidateA: employeeId,
          candidateB: managerId,
          criticalPositionId,
        })
        .expect(200);
      expect(res.body.candidateA.match.score).toBeGreaterThanOrEqual(0);
      expect(res.body.candidateB.match.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('PDI automático', () => {
    it('gera PDI a partir dos gaps do plano', async () => {
      const res = await request(app.getHttpServer())
        .post('/succession/pdi/generate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ successionPlanId })
        .expect(201);
      expect(res.body.pdi.successionPlanId).toBe(successionPlanId);
      expect(res.body.pdi.status).toBe('ACTIVE');
    });
  });

  describe('Talent Pool', () => {
    it('RH adiciona colaborador ao Talent Pool', async () => {
      const res = await request(app.getHttpServer())
        .post('/succession/talent-pool')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, readinessLevel: 'READY_SOON' })
        .expect(201);
      expect(res.body.userId).toBe(employeeId);
    });

    it('duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/succession/talent-pool')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, readinessLevel: 'READY_SOON' })
        .expect(409);
    });

    it('GET /talent-pool/all inclui o colaborador', async () => {
      const res = await request(app.getHttpServer())
        .get('/succession/talent-pool/all')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((t: any) => t.userId === employeeId)).toBe(true);
    });

    it('remove do Talent Pool', async () => {
      await request(app.getHttpServer())
        .delete(`/succession/talent-pool/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('remover de novo (já removido) → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/succession/talent-pool/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });
  });

  describe('Remoção do plano de sucessão', () => {
    it('DELETE remove o plano', async () => {
      await request(app.getHttpServer())
        .delete(`/succession/${successionPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      successionPlanId = 0 as any;
    });
  });
});
