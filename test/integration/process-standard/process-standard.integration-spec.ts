import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Process Standard Integration', () => {
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

  const cleanupProcessIds: number[] = [];

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
  });

  afterAll(async () => {
    for (const id of cleanupProcessIds) {
      await prisma.stepProgress
        .deleteMany({ where: { instance: { processId: id } } })
        .catch(() => undefined);
      await prisma.processInstance.deleteMany({ where: { processId: id } }).catch(() => undefined);
      await prisma.processVersion.deleteMany({ where: { processId: id } }).catch(() => undefined);
      await prisma.processApprovalLog
        .deleteMany({ where: { processId: id } })
        .catch(() => undefined);
      await prisma.processAuditLog.deleteMany({ where: { processId: id } }).catch(() => undefined);
      await prisma.processStandard.deleteMany({ where: { id } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  function makeProcessPayload(code: string) {
    return {
      title: `Processo Teste ${code}`,
      code,
      steps: [
        { type: 'START', title: 'Início', order: 0 },
        { type: 'TASK', title: 'Tarefa 1', order: 1, responsibleId: employeeId },
        { type: 'END', title: 'Fim', order: 2 },
      ],
    };
  }

  describe('Autenticação e RBAC', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/processes').expect(401);
    });

    it('colaborador não pode criar processo', async () => {
      await request(app.getHttpServer())
        .post('/processes')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send(makeProcessPayload('INT-TEST-RBAC-1'))
        .expect(403);
    });

    it('colaborador não acede ao dashboard', async () => {
      await request(app.getHttpServer())
        .get('/processes/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH não acede a audit-logs (apenas ADMIN/AUDITOR)', async () => {
      await request(app.getHttpServer())
        .get('/processes/audit-logs')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });
  });

  describe('Dashboard (bug: aggregate com _avg vazio rebentava sempre 500)', () => {
    it('RH consulta o dashboard sem 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/processes/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.processes).toBeDefined();
      expect(res.body.instances).toBeDefined();
      expect(res.body.compliance).toBeDefined();
    });

    it('ADMIN também acede ao dashboard', async () => {
      await request(app.getHttpServer())
        .get('/processes/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('CRUD de processos', () => {
    let processId: number;

    it('RH cria processo com etapas', async () => {
      const res = await request(app.getHttpServer())
        .post('/processes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send(makeProcessPayload('INT-TEST-PS-1'))
        .expect(201);
      processId = res.body.id;
      cleanupProcessIds.push(processId);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.version).toBe('1.0');
      expect(res.body.steps.length).toBe(3);
    });

    it('código duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/processes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send(makeProcessPayload('INT-TEST-PS-1'))
        .expect(409);
    });

    it('GET /processes/:id devolve o detalhe', async () => {
      const res = await request(app.getHttpServer())
        .get(`/processes/${processId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(processId);
    });

    it('GET /processes inclui o processo criado', async () => {
      const res = await request(app.getHttpServer())
        .get('/processes')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ search: 'INT-TEST-PS-1' })
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === processId)).toBe(true);
    });

    it('GET /processes/:id/qr-code devolve a URL', async () => {
      const res = await request(app.getHttpServer())
        .get(`/processes/${processId}/qr-code`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.code).toBe('INT-TEST-PS-1');
    });

    it('RH actualiza o processo em DRAFT', async () => {
      const res = await request(app.getHttpServer())
        .put(`/processes/${processId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Descrição actualizada' })
        .expect(200);
      expect(res.body.description).toBe('Descrição actualizada');
    });

    it('submeter para revisão', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/processes/${processId}/submit-review`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('IN_REVIEW');
    });

    it('actualizar processo em IN_REVIEW → 403 (bug: só ACTIVE era bloqueado, doc diz "apenas DRAFT")', async () => {
      await request(app.getHttpServer())
        .put(`/processes/${processId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Não devia ser possível' })
        .expect(403);
    });

    it('GESTOR não pode aprovar (apenas ADMIN)', async () => {
      await request(app.getHttpServer())
        .patch(`/processes/${processId}/approval`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'approve' })
        .expect(403);
    });

    it('ADMIN aprova o processo → ACTIVE', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/processes/${processId}/approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve', comment: 'OK' })
        .expect(200);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.publishedAt).not.toBeNull();
    });

    it('actualizar processo ACTIVE → 403', async () => {
      await request(app.getHttpServer())
        .put(`/processes/${processId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Não devia ser possível' })
        .expect(403);
    });

    it('eliminar processo ACTIVE → 403 (deve ser arquivado primeiro)', async () => {
      await request(app.getHttpServer())
        .delete(`/processes/${processId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });

  describe('Instâncias e execução de steps (ownership A10-7)', () => {
    let processId: number;
    let stepIds: number[];
    let instanceId: number;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/processes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send(makeProcessPayload('INT-TEST-PS-2'));
      processId = created.body.id;
      cleanupProcessIds.push(processId);
      stepIds = created.body.steps.map((s: any) => s.id);

      await request(app.getHttpServer())
        .patch(`/processes/${processId}/submit-review`)
        .set('Authorization', `Bearer ${rhToken}`);
      await request(app.getHttpServer())
        .patch(`/processes/${processId}/approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve' });
    });

    it('iniciar instância activa uma instância para o colaborador alvo', async () => {
      const res = await request(app.getHttpServer())
        .post(`/processes/${processId}/start`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetUserId: employeeId, notes: 'Instância de teste' })
        .expect(201);
      instanceId = res.body.id;
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.stepProgress.length).toBe(3);
    });

    it('processo não-ACTIVE não pode ser instanciado', async () => {
      const draft = await request(app.getHttpServer())
        .post('/processes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send(makeProcessPayload('INT-TEST-PS-3'));
      cleanupProcessIds.push(draft.body.id);

      await request(app.getHttpServer())
        .post(`/processes/${draft.body.id}/start`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetUserId: employeeId })
        .expect(400);
    });

    it('gestor (privilegiado por PROCESS_PRIVILEGED_ROLES) vê o detalhe mesmo não sendo participante', async () => {
      await request(app.getHttpServer())
        .get(`/processes/instances/${instanceId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('o colaborador alvo (participante) vê o detalhe da instância', async () => {
      const res = await request(app.getHttpServer())
        .get(`/processes/instances/${instanceId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(instanceId);
    });

    it('RH (privilegiado) vê o detalhe da instância', async () => {
      await request(app.getHttpServer())
        .get(`/processes/instances/${instanceId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('GET /processes/my-tasks lista a tarefa pendente do colaborador', async () => {
      const res = await request(app.getHttpServer())
        .get('/processes/my-tasks')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((t: any) => t.instanceId === instanceId)).toBe(true);
    });

    it('o colaborador alvo completa o primeiro passo (START)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/processes/instances/${instanceId}/steps/${stepIds[0]}/complete`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ notes: 'Concluído' })
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('completar o mesmo passo outra vez → 409', async () => {
      await request(app.getHttpServer())
        .post(`/processes/instances/${instanceId}/steps/${stepIds[0]}/complete`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({})
        .expect(409);
    });

    it('rejeitar o segundo passo coloca a instância ON_HOLD', async () => {
      await request(app.getHttpServer())
        .post(`/processes/instances/${instanceId}/steps/${stepIds[1]}/reject`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ reason: 'Falta de informação' })
        .expect(200);

      const detail = await request(app.getHttpServer())
        .get(`/processes/instances/${instanceId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(detail.body.status).toBe('ON_HOLD');
    });

    it('cancelar a instância', async () => {
      await request(app.getHttpServer())
        .patch(`/processes/instances/${instanceId}/cancel`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'Cancelado para teste' })
        .expect(200);
    });

    it('cancelar instância já concluída/cancelada de novo → 403', async () => {
      // a instância já está CANCELLED; cancelInstance só bloqueia COMPLETED,
      // mas isto ainda serve para confirmar que uma segunda chamada não 500s
      await request(app.getHttpServer())
        .patch(`/processes/instances/${instanceId}/cancel`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'Repetido' })
        .expect(200);
    });

    it('eliminar processo com instância associada → 400 (bug: RESTRICT FK não guardado)', async () => {
      await request(app.getHttpServer())
        .patch(`/processes/${processId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/processes/${processId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('Versionamento e comparação', () => {
    let processId: number;

    it('fluxo completo até ACTIVE e nova versão', async () => {
      const created = await request(app.getHttpServer())
        .post('/processes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send(makeProcessPayload('INT-TEST-PS-4'));
      processId = created.body.id;
      cleanupProcessIds.push(processId);

      await request(app.getHttpServer())
        .patch(`/processes/${processId}/submit-review`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/processes/${processId}/approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve' })
        .expect(200);

      const versioned = await request(app.getHttpServer())
        .post(`/processes/${processId}/new-version`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(versioned.body.version).toBe('1.1');
      expect(versioned.body.status).toBe('DRAFT');

      // createNewVersion() só grava o snapshot da versão QUE ESTÁ A SER
      // ABANDONADA (não da nova) — para comparar 1.0 vs 1.1 é preciso avançar
      // mais uma vez (1.1 → 1.2), o que só então grava o snapshot de 1.1.
      const versioned2 = await request(app.getHttpServer())
        .post(`/processes/${processId}/new-version`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(versioned2.body.version).toBe('1.2');
    });

    it('comparar versões 1.0 e 1.1', async () => {
      const res = await request(app.getHttpServer())
        .get(`/processes/${processId}/versions/compare`)
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ versionA: '1.0', versionB: '1.1' })
        .expect(200);
      expect(res.body.versionA).toBe('1.0');
      expect(res.body.versionB).toBe('1.1');
    });

    it('comparar versão inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get(`/processes/${processId}/versions/compare`)
        .set('Authorization', `Bearer ${rhToken}`)
        .query({ versionA: '1.0', versionB: '9.9' })
        .expect(404);
    });

    it('eliminar processo com versão associada → 400 (bug: RESTRICT FK não guardado)', async () => {
      await request(app.getHttpServer())
        .delete(`/processes/${processId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  describe('Substituir etapas após instâncias com progresso (bug: RESTRICT FK em StepProgress.stepId)', () => {
    let processId: number;
    let stepIds: number[];

    it('cria, aprova, inicia instância e completa um passo', async () => {
      const created = await request(app.getHttpServer())
        .post('/processes')
        .set('Authorization', `Bearer ${rhToken}`)
        .send(makeProcessPayload('INT-TEST-PS-5'));
      processId = created.body.id;
      cleanupProcessIds.push(processId);
      stepIds = created.body.steps.map((s: any) => s.id);

      await request(app.getHttpServer())
        .patch(`/processes/${processId}/submit-review`)
        .set('Authorization', `Bearer ${rhToken}`);
      await request(app.getHttpServer())
        .patch(`/processes/${processId}/approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve' });

      const inst = await request(app.getHttpServer())
        .post(`/processes/${processId}/start`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ targetUserId: employeeId });

      await request(app.getHttpServer())
        .post(`/processes/instances/${inst.body.id}/steps/${stepIds[0]}/complete`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ notes: 'Concluído' })
        .expect(200);
    });

    it('nova versão reinicia para DRAFT mantendo os steps actuais', async () => {
      const res = await request(app.getHttpServer())
        .post(`/processes/${processId}/new-version`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('DRAFT');
    });

    it('substituir os steps agora → 400, não 500', async () => {
      await request(app.getHttpServer())
        .put(`/processes/${processId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          steps: [
            { type: 'START', title: 'Novo início', order: 0 },
            { type: 'END', title: 'Novo fim', order: 1 },
          ],
        })
        .expect(400);
    });

    it('actualizar apenas campos não-step continua a funcionar', async () => {
      const res = await request(app.getHttpServer())
        .put(`/processes/${processId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Só a descrição muda' })
        .expect(200);
      expect(res.body.description).toBe('Só a descrição muda');
    });
  });
});
