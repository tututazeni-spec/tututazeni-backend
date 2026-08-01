import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const MARK = `IntTestTraining${Date.now()}`;

describe('Trainings Integration', () => {
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

  let trainingId: number;
  let sessionId: number;
  let participantId: number;

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
    if (trainingId) {
      await prisma.trainingRating.deleteMany({ where: { trainingId } }).catch(() => undefined);
      await prisma.trainingParticipant.deleteMany({ where: { trainingId } }).catch(() => undefined);
      if (sessionId) {
        await prisma.trainingParticipant
          .deleteMany({ where: { sessionId } })
          .catch(() => undefined);
        await prisma.trainingSession
          .deleteMany({ where: { id: sessionId } })
          .catch(() => undefined);
      }
      await prisma.training.deleteMany({ where: { id: trainingId } }).catch(() => undefined);
    }
    // O certificado de conclusão é emitido para o gestor (managerId), não
    // para o employeeId — apanhado só depois de uma fuga real ter deixado
    // 6 linhas residuais na BD ao longo de várias execuções de depuração.
    await prisma.certificate
      .deleteMany({ where: { userId: managerId, type: 'TRAINING' } })
      .catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Autenticação e RBAC', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/trainings').expect(401);
    });

    it('qualquer autenticado pode ver o catálogo', async () => {
      await request(app.getHttpServer())
        .get('/trainings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });

    it('colaborador não pode criar treinamento', async () => {
      await request(app.getHttpServer())
        .post('/trainings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'x', type: 'ONLINE', level: 'BEGINNER' })
        .expect(403);
    });

    it('colaborador não acede ao dashboard admin', async () => {
      await request(app.getHttpServer())
        .get('/trainings/admin/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Catálogo de treinamentos', () => {
    it('RH cria treinamento (DRAFT por omissão)', async () => {
      const res = await request(app.getHttpServer())
        .post('/trainings')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: `${MARK} Liderança`,
          type: 'ONLINE',
          level: 'INTERMEDIATE',
          mandatory: true,
          issueCertificate: true,
          passingScore: 60,
        })
        .expect(201);
      trainingId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('treinamento DRAFT não aparece no catálogo público (default status=PUBLISHED)', async () => {
      const res = await request(app.getHttpServer())
        .get('/trainings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ search: MARK })
        .expect(200);
      expect(res.body.data.some((t: any) => t.id === trainingId)).toBe(false);
    });

    it('publica o treinamento', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/trainings/${trainingId}/publish`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('agora aparece no catálogo público', async () => {
      const res = await request(app.getHttpServer())
        .get('/trainings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ search: MARK })
        .expect(200);
      expect(res.body.data.some((t: any) => t.id === trainingId)).toBe(true);
    });

    it('?mandatory=false (bug: coagia para true) exclui o treinamento obrigatório', async () => {
      const res = await request(app.getHttpServer())
        .get('/trainings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ search: MARK, mandatory: 'false' })
        .expect(200);
      expect(res.body.data.some((t: any) => t.id === trainingId)).toBe(false);
    });

    it('?mandatory=true inclui o treinamento obrigatório', async () => {
      const res = await request(app.getHttpServer())
        .get('/trainings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ search: MARK, mandatory: 'true' })
        .expect(200);
      expect(res.body.data.some((t: any) => t.id === trainingId)).toBe(true);
    });

    it('GET /:id devolve detalhe com avgRating', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trainings/${trainingId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.avgRating).toBe(0);
    });
  });

  describe('Sessões e inscrições (com controlo de vagas e lista de espera)', () => {
    it('RH cria sessão com 1 vaga e waitlist activo', async () => {
      const res = await request(app.getHttpServer())
        .post('/trainings/sessions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          trainingId,
          sessionDate: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 60,
          modality: 'ONLINE',
          maxParticipants: 1,
          waitlistEnabled: true,
        })
        .expect(201);
      sessionId = res.body.id;
    });

    it('colaborador inscreve-se (1ª vaga → REGISTERED)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/trainings/sessions/${sessionId}/self-register`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      participantId = res.body.id;
      expect(res.body.status).toBe('REGISTERED');
    });

    it('inscrição duplicada → 409', async () => {
      await request(app.getHttpServer())
        .post(`/trainings/sessions/${sessionId}/self-register`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);
    });

    it('gestor inscreve-se (vagas esgotadas → WAITLIST)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/trainings/sessions/${sessionId}/self-register`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(201);
      expect(res.body.status).toBe('WAITLIST');
    });

    it('lista de participantes da sessão', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trainings/sessions/${sessionId}/participants`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.length).toBe(2);
    });

    it('colaborador cancela a própria inscrição — promove o da lista de espera', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/trainings/participants/${participantId}/cancel`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .query({ reason: 'Conflito de agenda' })
        .expect(200);
      expect(res.body.waitlistPromoted).toBe(true);

      const list = await request(app.getHttpServer())
        .get(`/trainings/sessions/${sessionId}/participants`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const managerEntry = list.body.find((p: any) => p.userId === managerId);
      expect(managerEntry.status).toBe('REGISTERED');
    });

    it('outro utilizador não pode cancelar inscrição alheia', async () => {
      const reReg = await request(app.getHttpServer())
        .post(`/trainings/sessions/${sessionId}/self-register`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/trainings/participants/${reReg.body.id}/cancel`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });
  });

  describe('Presença, conclusão e certificado', () => {
    it('regista presença em massa (apenas o gestor esteve presente)', async () => {
      const res = await request(app.getHttpServer())
        .post('/trainings/sessions/attendance/bulk')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ sessionId, presentUserIds: [managerId] })
        .expect(200);
      expect(res.body.attended).toBeGreaterThanOrEqual(1);
    });

    it('marca o gestor como COMPLETED com nota acima do passingScore — emite certificado', async () => {
      const list = await request(app.getHttpServer())
        .get(`/trainings/sessions/${sessionId}/participants`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      const managerEntry = list.body.find((p: any) => p.userId === managerId);

      await request(app.getHttpServer())
        .patch(`/trainings/participants/${managerEntry.id}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'COMPLETED', finalScore: 80 })
        .expect(200);

      const cert = await prisma.certificate.findFirst({
        where: { userId: managerId, type: 'TRAINING' },
      });
      expect(cert).not.toBeNull();
    });

    it('relatório de presença reflecte a conclusão', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trainings/${trainingId}/attendance-report`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.summary.totalSessions).toBe(1);
      expect(res.body.sessions[0].completed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Avaliação e histórico', () => {
    it('colaborador avalia o treinamento', async () => {
      const res = await request(app.getHttpServer())
        .post('/trainings/rate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ trainingId, rating: 5, comment: 'Excelente' })
        .expect(200);
      expect(res.body.rating).toBe(5);
    });

    it('reavaliar substitui a avaliação anterior (upsert)', async () => {
      await request(app.getHttpServer())
        .post('/trainings/rate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ trainingId, rating: 3 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/trainings/${trainingId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.avgRating).toBe(3);
    });

    it('GET /my lista o histórico do colaborador', async () => {
      const res = await request(app.getHttpServer())
        .get('/trainings/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((p: any) => p.session.training.id === trainingId)).toBe(true);
    });
  });

  describe('Dashboard admin', () => {
    it('RH consulta o dashboard admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/trainings/admin/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.trainings.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Remoção', () => {
    it('eliminar sessão com participantes → 400', async () => {
      await request(app.getHttpServer())
        .delete(`/trainings/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('eliminar treinamento publicado com participantes → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/trainings/${trainingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('arquivar o treinamento — ainda não pode ser eliminado (bug: TrainingRating é RESTRICT, guard não verificava)', async () => {
      await request(app.getHttpServer())
        .patch(`/trainings/${trainingId}/archive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Já arquivado (passa no guard de participantes), mas ainda tem uma
      // avaliação (rateTraining, testada acima) — sem o guard de ratings,
      // isto rebentava com uma violação de FK em bruto (500).
      await request(app.getHttpServer())
        .delete(`/trainings/${trainingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('remover a avaliação e só depois eliminar o treinamento com sucesso', async () => {
      await prisma.trainingRating.deleteMany({ where: { trainingId } });

      await request(app.getHttpServer())
        .delete(`/trainings/${trainingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      trainingId = 0 as any;
      sessionId = 0 as any;
    });
  });
});
