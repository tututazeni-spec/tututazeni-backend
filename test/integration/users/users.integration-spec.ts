import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const NEW_USER_EMAIL = 'int.users.newuser@innova-test.com';

describe('Users Integration', () => {
  let app: INestApplication;
  let rhToken: string;
  let employeeToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

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

    rhToken = await getToken(app.getHttpServer(), 'rh');
    employeeToken = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => {
    const stale = await prisma.user.findUnique({ where: { email: NEW_USER_EMAIL } });
    if (stale) {
      // NotificationLog.userId and UserAuditLog.userId/performedById are RESTRICT —
      // activate/deactivate/suspend create rows in both that block deleting the user.
      await prisma.notificationLog
        .deleteMany({ where: { userId: stale.id } })
        .catch(() => undefined);
      await prisma.userAuditLog
        .deleteMany({ where: { OR: [{ userId: stale.id }, { performedById: stale.id }] } })
        .catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: NEW_USER_EMAIL } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('GET /users', () => {
    it('RH lista utilizadores → 200 com fullName', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : res.body.data;
      if (items?.length > 0) {
        // REGRA: campo fullName (nunca name)
        expect(items[0]).toHaveProperty('fullName');
        expect(items[0]).not.toHaveProperty('name');
      }
    });

    it('Employee não pode listar utilizadores → 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });
  });

  // A10-1: GET /users/:id devolvia o hash da password (Prisma `include` sem
  // `select`/`omit`) a qualquer autenticado. Regressão: nunca deve reaparecer,
  // nem aqui nem em /users/me, para nenhum papel.
  describe('GET /users/:id e /users/me — nunca expõem password', () => {
    it('GET /users/me (employee) não tem campo password', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('password');
    });

    it('GET /users/:id (employee vendo outro utilizador) não tem campo password', async () => {
      const me = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/users/${me.body.id}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('password');
    });
  });

  describe('Gestão de utilizadores (Admin/RH)', () => {
    const newUserEmail = NEW_USER_EMAIL;
    let newUserId: number;

    it('colaborador não pode criar utilizador → 403', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ fullName: 'Novo Utilizador', email: newUserEmail })
        .expect(403);
    });

    it('RH cria utilizador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ fullName: 'Novo Utilizador Integração', email: newUserEmail })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).not.toHaveProperty('password');
      newUserId = res.body.id;
    });

    it('email duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ fullName: 'Duplicado', email: newUserEmail })
        .expect(409);
    });

    it('RH actualiza dados do utilizador → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/users/${newUserId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ fullName: 'Nome Actualizado' })
        .expect(200);
      expect(res.body.fullName).toBe('Nome Actualizado');
    });

    it('actualizar utilizador inexistente → 404', async () => {
      await request(app.getHttpServer())
        .put('/users/999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ fullName: 'x' })
        .expect(404);
    });

    it('RH desactiva o utilizador → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${newUserId}/deactivate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'Teste de integração' })
        .expect(200);
      expect(res.body.active).toBe(false);
    });

    it('RH reactiva o utilizador → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${newUserId}/activate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.active).toBe(true);
    });

    it('RH suspende o utilizador → 200', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${newUserId}/suspend`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'Investigação em curso' })
        .expect(200);
    });

    it('colaborador não pode eliminar utilizador (só ADMIN) → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${newUserId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH (não ADMIN) não pode eliminar utilizador → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${newUserId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });
  });

  describe('Directório e "me" endpoints', () => {
    it('directório de colaboradores → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/directory')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('estatísticas do próprio utilizador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me/stats')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('colaborador não acede ao dashboard administrativo → 403', async () => {
      await request(app.getHttpServer())
        .get('/users/admin/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH acede ao dashboard administrativo → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/admin/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });
});
