import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test';

describe('Enrollment Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let courseId: number;

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

    const course = await prisma.course.findFirst({
      where: { internalCode: 'INT-TEST-001' },
    });
    courseId = course?.id ?? 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('POST /enrollments/self-enroll/:courseId', () => {
    it('inscrição com sucesso → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/enrollments/self-enroll/${courseId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);

      expect(res.body).toHaveProperty('courseId', courseId);
    });

    it('inscrição duplicada → 409 (@@unique courseId_userId)', async () => {
      await request(app.getHttpServer())
        .post(`/enrollments/self-enroll/${courseId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .post(`/enrollments/self-enroll/${courseId}`)
        .expect(401);
    });
  });

  describe('GET /enrollments/my', () => {
    it('lista inscrições do utilizador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollments/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : res.body.data ?? res.body;
      expect(items).toBeDefined();
    });
  });
});
