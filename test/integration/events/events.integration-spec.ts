import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Events Integration', () => {
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

  let eventId: number;
  let waitlistEventId: number;

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
    const ids = [eventId, waitlistEventId].filter(Boolean);
    if (ids.length) {
      await prisma.certificate
        .deleteMany({ where: { eventId: { in: ids } } })
        .catch(() => undefined);
      await prisma.eventFeedback
        .deleteMany({ where: { eventId: { in: ids } } })
        .catch(() => undefined);
      await prisma.eventParticipant
        .deleteMany({ where: { eventId: { in: ids } } })
        .catch(() => undefined);
      await prisma.event.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('CRUD e ciclo de vida', () => {
    it('colaborador não pode criar evento → 403', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          title: 'X',
          type: 'WEBINAR',
          startAt: '2026-06-01T10:00:00Z',
          endAt: '2026-06-01T12:00:00Z',
        })
        .expect(403);
    });

    it('gestor cria evento (fica DRAFT) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Int Test Webinar',
          type: 'WEBINAR',
          modalidade: 'ONLINE',
          startAt: new Date(Date.now() - 3600000).toISOString(),
          endAt: new Date(Date.now() + 3600000).toISOString(),
          maxCapacity: 1,
          waitlistEnabled: true,
          certificateEnabled: true,
          minAttendancePercent: 0,
        })
        .expect(201);
      eventId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('publicar evento → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('GET /events — lista eventos publicados → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/events')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((e: any) => e.id === eventId)).toBe(true);
    });

    it('GET /events/upcoming — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/events/upcoming')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Inscrição, lista de espera e check-in', () => {
    it('colaborador inscreve-se → CONFIRMED (capacidade 1)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/events/${eventId}/join`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body.status).toBe('CONFIRMED');
    });

    it('gestor tenta inscrever-se no mesmo evento (lotado) → WAITLIST', async () => {
      const res = await request(app.getHttpServer())
        .post(`/events/${eventId}/join`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(201);
      expect(res.body.status).toBe('WAITLIST');
    });

    it('reinscrição do mesmo utilizador já inscrito → 409', async () => {
      await request(app.getHttpServer())
        .post(`/events/${eventId}/join`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);
    });

    it('colaborador faz check-in → PRESENT', async () => {
      const res = await request(app.getHttpServer())
        .post('/events/checkin')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ eventId })
        .expect(200);
      expect(res.body.status).toBe('PRESENT');
    });

    it('RH actualiza estado do participante (gestor, ainda em WAITLIST) para NO_SHOW → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/events/${eventId}/participants/${managerId}/status`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ status: 'NO_SHOW', note: 'Não compareceu' })
        .expect(200);
      expect(res.body.status).toBe('NO_SHOW');
    });
  });

  describe('Feedback, NPS e certificado automático', () => {
    it('colaborador (já com check-in PRESENT) submete feedback → emite certificado', async () => {
      const res = await request(app.getHttpServer())
        .post(`/events/${eventId}/feedback`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ nps: 9, rating: 5, instructorRating: 4, comment: 'Excelente sessão' })
        .expect(201);
      expect(res.body.nps).toBe(9);

      const cert = await prisma.certificate.findFirst({ where: { userId: employeeId, eventId } });
      expect(cert).toBeTruthy();
    });

    it('GET /events/:id — reflecte NPS médio e ocupação', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.avgNps).toBe(9);
    });

    it('GET /events/organizer/dashboard — gestor vê as suas métricas', async () => {
      const res = await request(app.getHttpServer())
        .get('/events/organizer/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.events.some((e: any) => e.id === eventId)).toBe(true);
    });

    it('GET /events/my — colaborador vê a sua inscrição (past ou upcoming)', async () => {
      const res = await request(app.getHttpServer())
        .get('/events/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const all = [...res.body.upcoming, ...res.body.past];
      expect(all.some((p: any) => p.eventId === eventId)).toBe(true);
    });

    it('GET /events/stats — RH → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/events/stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Lista de espera — promoção ao sair', () => {
    it('admin entra na lista de espera (evento ainda lotado pelo colaborador)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/events/${eventId}/join`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(res.body.status).toBe('WAITLIST');
    });

    it('colaborador cancela a inscrição → promove o admin da lista de espera', async () => {
      await request(app.getHttpServer())
        .post(`/events/${eventId}/leave`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const admin = await prisma.user.findUnique({ where: { email: 'int.admin@innova-test.com' } });
      const adminParticipation = await prisma.eventParticipant.findUnique({
        where: { eventId_userId: { eventId, userId: admin!.id } },
      });
      expect(adminParticipation!.status).toBe('CONFIRMED');
    });
  });

  describe('Cancelamento e remoção', () => {
    it('gestor cria segundo evento (para cancelar) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/events')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Int Test Cancellable Event',
          type: 'WORKSHOP',
          startAt: new Date(Date.now() + 86400000).toISOString(),
          endAt: new Date(Date.now() + 90000000).toISOString(),
        })
        .expect(201);
      waitlistEventId = res.body.id;
    });

    it('RH cancela o evento → notifica participantes', async () => {
      await request(app.getHttpServer())
        .patch(`/events/${waitlistEventId}/cancel`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const row = await prisma.event.findUnique({ where: { id: waitlistEventId } });
      expect(row!.status).toBe('CANCELLED');
    });

    it('não é possível eliminar evento publicado → 400', async () => {
      await request(app.getHttpServer())
        .delete(`/events/${eventId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(400);
    });
  });
});
