import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { AiProvidersService } from '../../../src/ai-tutor/ai-providers.service';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const COURSE_CODE = 'INT-TEST-AI-TUTOR';

// AiProvidersService faz chamadas reais a Groq/Gemini/Ollama — sem chave de API
// configurada em .env.test isso lançaria 500 antes de sequer tentar rede. Para
// testar a lógica de negócio real (sessões, mensagens, XP, acções agentic) sem
// depender de uma API externa paga/instável, substitui-se apenas esta fronteira
// externa por um stub — todo o resto (guards, BD real, permissões) mantém-se real.
const stubChat = jest.fn().mockResolvedValue({
  text: 'Resposta simulada do tutor de IA.',
  tokensUsed: 42,
  provider: 'stub',
  model: 'stub-model',
});
const stubProviderInfo = jest
  .fn()
  .mockReturnValue({
    provider: 'Stub',
    model: 'stub-model',
    free: true,
    docs: 'https://stub.test',
  });

describe('AI Tutor Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let employeeId: number;
  let courseId: number;
  let sessionId: number;
  let assistantMessageId: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AiProvidersService)
      .useValue({ chat: stubChat, getProviderInfo: stubProviderInfo })
      .compile();

    app = module.createNestApplication();
    // Mesma configuração de main.ts — forbidNonWhitelisted é essencial aqui:
    // sem ela, DTOs com campos sem decorators de validação são silenciosamente
    // strippeados em vez de rejeitados, mascarando bugs reais (ver params abaixo).
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
    rhToken = await getToken(app.getHttpServer(), 'rh');
    adminToken = await getToken(app.getHttpServer(), 'admin');

    const employee = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employee!.id;

    const course = await prisma.course.upsert({
      where: { internalCode: COURSE_CODE },
      update: {},
      create: {
        title: 'Curso Integração — AI Tutor',
        internalCode: COURSE_CODE,
        description: 'Curso dedicado aos testes de integração do AI Tutor',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    await prisma.aiMessage
      .deleteMany({ where: { session: { userId: employeeId, courseId } } })
      .catch(() => undefined);
    await prisma.aiTutorSession
      .deleteMany({ where: { userId: employeeId, courseId } })
      .catch(() => undefined);
    await prisma.aiTutorMemory.deleteMany({ where: { userId: employeeId } }).catch(() => undefined);
    await prisma.enrollment
      .deleteMany({ where: { userId: employeeId, courseId } })
      .catch(() => undefined);
    await prisma.course.deleteMany({ where: { internalCode: COURSE_CODE } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Info', () => {
    it('GET /ai-tutor/provider — qualquer autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/ai-tutor/provider')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.provider).toBe('Stub');
    });

    it('GET /ai-tutor/stats — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/ai-tutor/stats')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('GET /ai-tutor/stats — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/ai-tutor/stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('totalSessions');
    });
  });

  describe('Sessões', () => {
    it('POST /ai-tutor/sessions — inicia sessão contextualizada com curso → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/ai-tutor/sessions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ courseId, personality: 'COACH' })
        .expect(201);

      expect(res.body.session).toHaveProperty('id');
      expect(res.body.courseTitle).toBe('Curso Integração — AI Tutor');
      expect(res.body.greeting).toContain('NOVA');
      sessionId = res.body.session.id;
    });

    it('GET /ai-tutor/sessions — lista as minhas sessões → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/ai-tutor/sessions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((s: any) => s.id === sessionId)).toBe(true);
    });

    it('GET /ai-tutor/sessions/:id — detalhe com histórico → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/ai-tutor/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(sessionId);
    });

    it('GET /ai-tutor/sessions/:id — sessão de outro utilizador → 404', async () => {
      await request(app.getHttpServer())
        .get(`/ai-tutor/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('GET /ai-tutor/sessions/:id — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/ai-tutor/sessions/999999')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });

  describe('Mensagens', () => {
    it('POST /ai-tutor/sessions/message — envia mensagem e recebe resposta do provider → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/ai-tutor/sessions/message')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ sessionId, message: 'O que é uma taxa de juro efectiva?' })
        .expect(201);

      expect(res.body.provider).toBe('stub');
      expect(res.body.message.content).toBe('Resposta simulada do tutor de IA.');
      assistantMessageId = res.body.message.id;
    });

    it('POST /ai-tutor/sessions/message — mensagem vazia → 400', async () => {
      await request(app.getHttpServer())
        .post('/ai-tutor/sessions/message')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ sessionId, message: '   ' })
        .expect(400);
    });

    it('POST /ai-tutor/sessions/message — sessão de outro utilizador → 404', async () => {
      await request(app.getHttpServer())
        .post('/ai-tutor/sessions/message')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ sessionId, message: 'Olá' })
        .expect(404);
    });
  });

  describe('Avaliação de mensagens', () => {
    it('PATCH /ai-tutor/messages/rate — avalia resposta do tutor → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch('/ai-tutor/messages/rate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ messageId: assistantMessageId, rating: 5, feedback: 'Muito útil' })
        .expect(200);
      expect(res.body.rating).toBe(5);
    });

    it('PATCH /ai-tutor/messages/rate — mensagem inexistente → 404', async () => {
      await request(app.getHttpServer())
        .patch('/ai-tutor/messages/rate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ messageId: 999999, rating: 3 })
        .expect(404);
    });
  });

  describe('Acções agentic', () => {
    it('POST /ai-tutor/agent/execute — sem confirmação → 400', async () => {
      await request(app.getHttpServer())
        .post('/ai-tutor/agent/execute')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ sessionId, action: 'ENROLL_COURSE', params: { courseId }, confirmed: false })
        .expect(400);
    });

    it('POST /ai-tutor/agent/execute — inscreve no curso (ENROLL_COURSE) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/ai-tutor/agent/execute')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ sessionId, action: 'ENROLL_COURSE', params: { courseId }, confirmed: true })
        .expect(201);
      expect(res.body.action).toBe('ENROLL_COURSE');
    });

    it('POST /ai-tutor/agent/execute — já inscrito → 400', async () => {
      await request(app.getHttpServer())
        .post('/ai-tutor/agent/execute')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ sessionId, action: 'ENROLL_COURSE', params: { courseId }, confirmed: true })
        .expect(400);
    });

    it('POST /ai-tutor/agent/execute — NOTIFY_MANAGER sem gestor definido → 400', async () => {
      await request(app.getHttpServer())
        .post('/ai-tutor/agent/execute')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ sessionId, action: 'NOTIFY_MANAGER', params: {}, confirmed: true })
        .expect(400);
    });
  });

  describe('Geração de conteúdo', () => {
    it('POST /ai-tutor/generate — resumo a partir de tema livre → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/ai-tutor/generate')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ type: 'SUMMARY', topic: 'Gestão do tempo' })
        .expect(201);
      expect(res.body.provider).toBe('stub');
      expect(res.body.raw).toBe('Resposta simulada do tutor de IA.');
    });
  });

  describe('Recomendações', () => {
    it('GET /ai-tutor/recommendations → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/ai-tutor/recommendations')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('aiInsight');
    });
  });

  describe('Encerrar sessão', () => {
    it('PATCH /ai-tutor/sessions/:id/end → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/ai-tutor/sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.endedAt).not.toBeNull();
    });

    it('POST /ai-tutor/sessions/message — sessão já encerrada → 400', async () => {
      await request(app.getHttpServer())
        .post('/ai-tutor/sessions/message')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ sessionId, message: 'Ainda estás aí?' })
        .expect(400);
    });

    it('PATCH /ai-tutor/sessions/:id/end — inexistente → 404', async () => {
      await request(app.getHttpServer())
        .patch('/ai-tutor/sessions/999999/end')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });
});
