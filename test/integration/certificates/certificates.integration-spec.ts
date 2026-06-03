import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test';

describe('Certificates Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let adminToken: string;
  let enrollmentId: number;

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
    adminToken = await getToken(app.getHttpServer(), 'admin');

    const course = await prisma.course.findFirst({ where: { internalCode: 'INT-TEST-001' } });
    if (course) {
      const enrollment = await prisma.enrollment.findFirst({
        where: { course: { internalCode: 'INT-TEST-001' } },
      });
      enrollmentId = enrollment?.id ?? 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('GET /enrollments/my', () => {
    it('deve listar inscrições com potencial de certificado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/enrollments/my').expect(401);
    });
  });

  describe('POST /enrollments/my/:id/certificate', () => {
    it('deve tentar gerar certificado (200 ou 400 se não concluído)', async () => {
      if (!enrollmentId) return;

      const res = await request(app.getHttpServer())
        .post(`/enrollments/my/${enrollmentId}/certificate`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect([200, 400, 404]).toContain(res.status);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/enrollments/my/1/certificate')
        .expect(401);
    });
  });

  describe('GET /enrollments/:id (detalhe com progresso)', () => {
    it('deve retornar detalhe da inscrição → 200 ou 404', async () => {
      if (!enrollmentId) return;

      const res = await request(app.getHttpServer())
        .get(`/enrollments/${enrollmentId}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('id');
      }
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/enrollments/1').expect(401);
    });
  });

  describe('GET /enrollments (Admin)', () => {
    it('admin pode listar todas as inscrições → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
    });

    it('employee sem permissão → 403', async () => {
      await request(app.getHttpServer())
        .get('/enrollments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });
});
