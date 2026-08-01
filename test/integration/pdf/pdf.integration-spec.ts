import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('Pdf Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Autenticação (JwtAuthGuard global)', () => {
    it('sem token → 401 em todas as rotas', async () => {
      await request(app.getHttpServer()).get('/pdf/declaration/1').expect(401);
      await request(app.getHttpServer()).get('/pdf/certificate/1').expect(401);
      await request(app.getHttpServer()).get('/pdf/payslip/1').expect(401);
      await request(app.getHttpServer()).get('/pdf/report/1').expect(401);
    });
  });

  describe('GET /pdf/declaration/:id — qualquer autenticado (ainda placeholder, A10-20)', () => {
    it('colaborador recebe um PDF válido', async () => {
      const res = await request(app.getHttpServer())
        .get('/pdf/declaration/1')
        .set('Authorization', `Bearer ${employeeToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('declaracao-1.pdf');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('GET /pdf/certificate/:id — qualquer autenticado', () => {
    it('colaborador recebe um PDF válido', async () => {
      const res = await request(app.getHttpServer())
        .get('/pdf/certificate/2')
        .set('Authorization', `Bearer ${employeeToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('GET /pdf/payslip/:id — restrito a ADMIN/RH', () => {
    it('colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/pdf/payslip/3')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor → 403', async () => {
      await request(app.getHttpServer())
        .get('/pdf/payslip/3')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('RH → 200, PDF válido', async () => {
      const res = await request(app.getHttpServer())
        .get('/pdf/payslip/3')
        .set('Authorization', `Bearer ${rhToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('ADMIN → 200', async () => {
      await request(app.getHttpServer())
        .get('/pdf/payslip/3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('GET /pdf/report/:id — restrito a ADMIN/RH', () => {
    it('colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/pdf/report/4')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH → 200, PDF válido', async () => {
      const res = await request(app.getHttpServer())
        .get('/pdf/report/4')
        .set('Authorization', `Bearer ${rhToken}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });
});
