import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const PROGRAM_TITLE = 'INT-TEST-AVATAR-TRAINING';
const REDACTED = '[removido por política de retenção]';

// Fluxo real contra Postgres (docs/Avatar_Training.md §16): avatar → formação →
// sessão → revisão → publicação → atribuição → sala (iniciar, pausar, retomar,
// concluir) → privacidade. Apanha divergências schema↔código que os mocks não vêem.
describe('Avatar Training Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

  let employeeId: number;
  let avatarId: number;
  let programId: number;
  let sessionId: number;
  let attemptId: number;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const attemptUrl = (action: string) => `/avatar-training/attempts/${attemptId}/${action}`;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    // Espelha src/main.ts (convenção deste repo).
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
    adminToken = await getToken(app.getHttpServer(), 'admin');
    const employee = await prisma.user.findUniqueOrThrow({
      where: { email: INT_CREDENTIALS.employee.email },
      select: { id: true },
    });
    employeeId = employee.id;
  });

  afterAll(async () => {
    // Filhos antes de pais: sessões, atribuições, tentativas e interacções caem em
    // cascata com a formação; o avatar só depois.
    await prisma.avatarTrainingProgram
      .deleteMany({ where: { title: PROGRAM_TITLE } })
      .catch(() => undefined);
    if (avatarId) {
      await prisma.trainingAvatar.delete({ where: { id: avatarId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('autenticação e permissões', () => {
    it('sem token → 401', async () => {
      await http().get('/avatar-training/avatars').expect(401);
    });

    it('colaborador não cria avatares → 403', async () => {
      await http()
        .post('/avatar-training/avatars')
        .set(as(employeeToken))
        .send({ name: 'INT-TEST Avatar' })
        .expect(403);
    });

    it('colaborador não vê a saúde dos fornecedores → 403', async () => {
      await http().get('/avatar-training/providers/health').set(as(employeeToken)).expect(403);
    });

    it('rejeita campos desconhecidos (forbidNonWhitelisted) → 400', async () => {
      await http()
        .post('/avatar-training/avatars')
        .set(as(adminToken))
        .send({ name: 'INT-TEST Avatar', campoInexistente: 1 })
        .expect(400);
    });
  });

  describe('construção e publicação', () => {
    it('ADMIN cria um avatar em teste', async () => {
      const res = await http()
        .post('/avatar-training/avatars')
        .set(as(adminToken))
        .send({ name: 'INT-TEST Avatar', language: 'pt', imageUrl: 'https://example.com/a.png' })
        .expect(201);
      avatarId = res.body.id;
      expect(res.body.status).toBe('TESTING');
    });

    it('activar sem teste prévio → 409', async () => {
      await http()
        .post(`/avatar-training/avatars/${avatarId}/status`)
        .set(as(adminToken))
        .send({ status: 'ACTIVE' })
        .expect(409);
    });

    it('testa e depois activa o avatar', async () => {
      const test = await http()
        .post(`/avatar-training/avatars/${avatarId}/test`)
        .set(as(adminToken))
        .expect(200);
      expect(test.body.ok).toBe(true);
      const res = await http()
        .post(`/avatar-training/avatars/${avatarId}/status`)
        .set(as(adminToken))
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('cria uma formação em rascunho', async () => {
      const res = await http()
        .post('/avatar-training/programs')
        .set(as(adminToken))
        .send({ title: PROGRAM_TITLE, avatarId })
        .expect(201);
      programId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('não submete uma formação sem sessões → 409', async () => {
      await http()
        .post(`/avatar-training/programs/${programId}/submit-review`)
        .set(as(adminToken))
        .expect(409);
    });

    it('cria uma sessão com duas etapas de conteúdo', async () => {
      const res = await http()
        .post('/avatar-training/sessions')
        .set(as(adminToken))
        .send({
          programId,
          title: 'Sessão de teste',
          steps: [
            { key: 'intro', title: 'Introdução', type: 'CONTENT', content: 'Bem-vindo.' },
            { key: 'fim', title: 'Conclusão', type: 'CONTENT', content: 'Obrigado.' },
          ],
        })
        .expect(201);
      sessionId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('sessão não publicada não pode ser atribuída → 404', async () => {
      await http()
        .post(`/avatar-training/sessions/${sessionId}/assign`)
        .set(as(adminToken))
        .send({ userIds: [employeeId] })
        .expect(404);
    });

    it('submete para revisão e publica (as sessões ficam publicadas)', async () => {
      await http()
        .post(`/avatar-training/programs/${programId}/submit-review`)
        .set(as(adminToken))
        .expect(200);
      const res = await http()
        .post(`/avatar-training/programs/${programId}/publish`)
        .set(as(adminToken))
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
      const session = await prisma.avatarTrainingSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.status).toBe('PUBLISHED');
    });
  });

  describe('atribuição e sessão do formando', () => {
    it('ADMIN atribui a sessão ao colaborador', async () => {
      await http()
        .post(`/avatar-training/sessions/${sessionId}/assign`)
        .set(as(adminToken))
        .send({ userIds: [employeeId] })
        .expect(200);
      const count = await prisma.avatarTrainingAssignment.count({
        where: { sessionId, userId: employeeId },
      });
      expect(count).toBe(1);
    });

    it('atribuir de novo não duplica o registo', async () => {
      await http()
        .post(`/avatar-training/sessions/${sessionId}/assign`)
        .set(as(adminToken))
        .send({ userIds: [employeeId] })
        .expect(200);
      const count = await prisma.avatarTrainingAssignment.count({
        where: { sessionId, userId: employeeId },
      });
      expect(count).toBe(1);
    });

    it('o colaborador vê a atribuição', async () => {
      const res = await http()
        .get('/avatar-training/my/assignments')
        .set(as(employeeToken))
        .expect(200);
      expect(JSON.stringify(res.body)).toContain('Sessão de teste');
    });

    it('quem não tem atribuição não inicia a sessão → 404', async () => {
      await http()
        .post(`/avatar-training/sessions/${sessionId}/start`)
        .set(as(managerToken))
        .send({})
        .expect(404);
    });

    it('o colaborador inicia a sessão e a sala identifica o instrutor virtual', async () => {
      const res = await http()
        .post(`/avatar-training/sessions/${sessionId}/start`)
        .set(as(employeeToken))
        .send({})
        .expect(200);
      attemptId = res.body.attempt.id;
      expect(res.body.notice).toMatch(/instrutor virtual/);
      const attempt = await prisma.avatarTrainingAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      expect(attempt.sessionVersion).toBe(1);
      expect(attempt.rubricVersion).toBe(1);
    });

    it('iniciar de novo retoma a tentativa aberta (sem duplicar)', async () => {
      const res = await http()
        .post(`/avatar-training/sessions/${sessionId}/start`)
        .set(as(employeeToken))
        .send({})
        .expect(200);
      expect(res.body.attempt.id).toBe(attemptId);
    });

    it('outro utilizador não acede à sala nem pausa a tentativa → 404', async () => {
      await http().get(attemptUrl('room')).set(as(managerToken)).expect(404);
      await http().post(attemptUrl('pause')).set(as(managerToken)).expect(404);
      await http().post(attemptUrl('pause')).set(as(adminToken)).expect(404);
    });

    it('o colaborador envia uma mensagem de texto (sem microfone)', async () => {
      await http()
        .post(attemptUrl('interactions'))
        .set(as(employeeToken))
        .send({ interactionType: 'USER_MESSAGE', content: 'Olá, instrutor' })
        .expect(201);
    });

    it('pausa, recusa interacções em pausa e retoma', async () => {
      await http().post(attemptUrl('pause')).set(as(employeeToken)).expect(200);
      await http()
        .post(attemptUrl('interactions'))
        .set(as(employeeToken))
        .send({ interactionType: 'USER_MESSAGE', content: 'ainda aí?' })
        .expect(409);
      await http().post(attemptUrl('resume')).set(as(employeeToken)).expect(200);
    });

    it('não conclui com etapas obrigatórias por fazer → 409', async () => {
      await http().post(attemptUrl('complete')).set(as(employeeToken)).expect(409);
    });

    it('conclui depois de avançar todas as etapas e actualiza a atribuição', async () => {
      for (const stepKey of ['intro', 'fim']) {
        await http()
          .post(attemptUrl('interactions'))
          .set(as(employeeToken))
          .send({ interactionType: 'STEP_ADVANCE', content: stepKey, stepKey })
          .expect(201);
      }
      await http().post(attemptUrl('complete')).set(as(employeeToken)).expect(200);
      const attempt = await prisma.avatarTrainingAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      expect(attempt.status).toBe('COMPLETED');
      const assignment = await prisma.avatarTrainingAssignment.findUniqueOrThrow({
        where: { sessionId_userId: { sessionId, userId: employeeId } },
      });
      expect(assignment.status).toBe('COMPLETED');
    });

    it('os resultados são visíveis ao dono e a ADMIN', async () => {
      const own = await http().get(attemptUrl('results')).set(as(employeeToken)).expect(200);
      expect(own.body.versions.outdated).toBe(false);
      await http().get(attemptUrl('results')).set(as(adminToken)).expect(200);
    });

    it('depois de concluída a tentativa já não aceita interacções → 409', async () => {
      await http()
        .post(attemptUrl('interactions'))
        .set(as(employeeToken))
        .send({ interactionType: 'USER_MESSAGE', content: 'fora de tempo' })
        .expect(409);
    });
  });

  describe('privacidade', () => {
    it('colaborador não elimina transcrições de outro utilizador → 403', async () => {
      await http()
        .delete(`/avatar-training/users/${employeeId}/transcripts`)
        .set(as(employeeToken))
        .expect(403);
    });

    it('o colaborador elimina as suas transcrições e o texto fica anonimizado', async () => {
      const res = await http()
        .delete('/avatar-training/my/transcripts')
        .set(as(employeeToken))
        .expect(200);
      expect(res.body.redacted).toBeGreaterThan(0);
      const rows = await prisma.avatarTrainingInteraction.findMany({
        where: { attemptId, interactionType: { in: ['USER_MESSAGE', 'AVATAR_MESSAGE'] } },
      });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => r.content === REDACTED)).toBe(true);
    });

    it('as etapas avançadas (registo pedagógico) não são anonimizadas', async () => {
      const steps = await prisma.avatarTrainingInteraction.findMany({
        where: { attemptId, interactionType: 'STEP_ADVANCE' },
      });
      expect(steps.length).toBe(2);
      expect(steps.every(r => r.content !== REDACTED)).toBe(true);
    });

    it('repetir a eliminação é idempotente', async () => {
      const res = await http()
        .delete('/avatar-training/my/transcripts')
        .set(as(employeeToken))
        .expect(200);
      expect(res.body.redacted).toBe(0);
    });
  });

  describe('arquivar', () => {
    it('ADMIN arquiva a formação e as sessões ficam arquivadas', async () => {
      await http()
        .post(`/avatar-training/programs/${programId}/archive`)
        .set(as(adminToken))
        .expect(200);
      const session = await prisma.avatarTrainingSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.status).toBe('ARCHIVED');
    });

    it('formação arquivada não volta a ser publicada → 409', async () => {
      await http()
        .post(`/avatar-training/programs/${programId}/publish`)
        .set(as(adminToken))
        .expect(409);
    });
  });
});
