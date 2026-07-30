import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('LMS Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  let pathId: string;
  let sessionId: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    rhToken = await getToken(app.getHttpServer(), 'rh');
  });

  afterAll(async () => {
    if (sessionId) {
      await (prisma as any).lmsLiveAttendance
        .deleteMany({ where: { sessionId } })
        .catch(() => undefined);
      await (prisma as any).lmsLiveSession
        .deleteMany({ where: { id: sessionId } })
        .catch(() => undefined);
    }
    if (pathId) {
      await (prisma as any).lmsPathEnrollment
        .deleteMany({ where: { pathId } })
        .catch(() => undefined);
      await (prisma as any).lmsLearningPath
        .deleteMany({ where: { id: pathId } })
        .catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Percursos de aprendizagem', () => {
    it('colaborador não pode criar percurso → 403', async () => {
      await request(app.getHttpServer())
        .post('/lms/paths')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ code: 'PATH-INT-001', name: 'Percurso Integração', courseIds: [] })
        .expect(403);
    });

    it('RH cria percurso → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/lms/paths')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          code: 'PATH-INT-001',
          name: 'Percurso Integração',
          courseIds: ['course-a', 'course-b'],
        })
        .expect(201);
      pathId = res.body.id;
    });

    it('código de percurso duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/lms/paths')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ code: 'PATH-INT-001', name: 'Duplicado', courseIds: [] })
        .expect(409);
    });

    it('lista percursos → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/lms/paths')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('detalhe de percurso existente → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/lms/paths/${pathId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', pathId);
    });

    it('detalhe de percurso inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/lms/paths/nao-existe')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('RH actualiza o percurso → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/lms/paths/${pathId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Percurso Integração (actualizado)' })
        .expect(200);
      expect(res.body.name).toBe('Percurso Integração (actualizado)');
    });

    it('colaborador inscreve-se no percurso → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/lms/paths/${pathId}/enroll`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('pathId', pathId);
    });

    it('inscrição duplicada no mesmo percurso → 409', async () => {
      await request(app.getHttpServer())
        .post(`/lms/paths/${pathId}/enroll`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);
    });

    it('colaborador vê os seus percursos → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/lms/my-paths')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((p: any) => p.pathId === pathId)).toBe(true);
    });

    it('marcar 1º curso concluído → progress 50%, ainda IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .put(`/lms/paths/${pathId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ completedCourseId: 'course-a' })
        .expect(200);
      expect(res.body.progress).toBe(50);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('marcar 2º curso concluído → progress 100%, COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .put(`/lms/paths/${pathId}/progress`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ completedCourseId: 'course-b' })
        .expect(200);
      expect(res.body.progress).toBe(100);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('colaborador vê as suas estatísticas de aprendizagem → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/lms/my-analytics')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('colaborador recebe recomendações → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/lms/recommendations')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Dashboard', () => {
    it('colaborador não acede ao dashboard → 403', async () => {
      await request(app.getHttpServer())
        .get('/lms/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH acede ao dashboard do LMS → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/lms/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('Sessões ao vivo', () => {
    it('colaborador não pode criar sessão → 403', async () => {
      await request(app.getHttpServer())
        .post('/lms/sessions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ title: 'Sessão Integração', scheduledAt: '2027-01-10T10:00:00.000Z', duration: 60 })
        .expect(403);
    });

    it('RH cria sessão ao vivo → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/lms/sessions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Sessão Integração', scheduledAt: '2027-01-10T10:00:00.000Z', duration: 60 })
        .expect(201);
      sessionId = res.body.id;
    });

    it('lista próximas sessões → inclui a sessão criada', async () => {
      const res = await request(app.getHttpServer())
        .get('/lms/sessions/upcoming')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((s: any) => s.id === sessionId)).toBe(true);
    });

    it('colaborador inscreve-se na sessão → 201', async () => {
      await request(app.getHttpServer())
        .post(`/lms/sessions/${sessionId}/register`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
    });

    it('inscrição duplicada na mesma sessão → 409', async () => {
      await request(app.getHttpServer())
        .post(`/lms/sessions/${sessionId}/register`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);
    });

    it('marcar presença → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/lms/sessions/${sessionId}/attend`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.attended).toBe(true);
    });

    it('marcar presença de sessão sem inscrição prévia → 404', async () => {
      await request(app.getHttpServer())
        .put('/lms/sessions/nao-existe/attend')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });

    it('submeter feedback da sessão → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/lms/sessions/${sessionId}/feedback`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ rating: 5, feedback: 'Excelente sessão' })
        .expect(200);
      expect(res.body.rating).toBe(5);
    });
  });

  describe('Remoção (soft delete)', () => {
    it('colaborador não pode remover percurso → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/lms/paths/${pathId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH remove o percurso (soft delete) → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/lms/paths/${pathId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });

    it('percurso removido deixa de ser acessível → 404', async () => {
      await request(app.getHttpServer())
        .get(`/lms/paths/${pathId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });
});
