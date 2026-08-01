import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const ROLE_NAME = 'Int Test Role — ACL';
const PERMISSION_NAME = 'int-test:acl-permission';

describe('ACL Integration', () => {
  let app: INestApplication;
  let adminToken: string;
  let rhToken: string;
  let employeeToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let roleId: number;
  let permissionId: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    adminToken = await getToken(app.getHttpServer(), 'admin');
    rhToken = await getToken(app.getHttpServer(), 'rh');
    employeeToken = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => {
    // Permission.roleId é obrigatório (RESTRICT implícito via FK NOT NULL) —
    // reatribuir para o role ADMIN antes de apagar o role de teste, e só então
    // apagar a permissão.
    const perm = await prisma.permission.findUnique({ where: { name: PERMISSION_NAME } });
    if (perm) {
      const adminRole = await prisma.role.findFirst({ where: { name: 'ADMIN' } });
      if (adminRole) {
        await prisma.permission
          .update({ where: { id: perm.id }, data: { roleId: adminRole.id } })
          .catch(() => undefined);
      }
      await prisma.permission
        .deleteMany({ where: { name: PERMISSION_NAME } })
        .catch(() => undefined);
    }
    await prisma.role
      .deleteMany({ where: { name: { contains: 'Int Test Role' } } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('my-permissions e check', () => {
    it('GET /acl/my-permissions — colaborador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/my-permissions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('permissions');
    });

    it('GET /acl/my-permissions — ADMIN tem wildcard → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/my-permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.permissions).toContain('*');
    });

    it('POST /acl/check — colaborador pode verificar permissão própria → 200', async () => {
      const me = await request(app.getHttpServer())
        .get('/acl/my-permissions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/acl/check')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: me.body.userId, action: 'VIEW', subject: 'DASHBOARD' })
        .expect(201);
      expect(res.body).toHaveProperty('allowed');
    });
  });

  describe('Permissões — CRUD (ADMIN/RH)', () => {
    it('colaborador não pode listar permissões → 403', async () => {
      await request(app.getHttpServer())
        .get('/acl/permissions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH lista permissões → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/permissions')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('RH cria permissão → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/acl/permissions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: PERMISSION_NAME, action: 'VIEW', subject: 'ACL' })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      permissionId = res.body.id;
    });
  });

  describe('Roles — CRUD (ADMIN/RH)', () => {
    it('colaborador não pode criar role → 403', async () => {
      await request(app.getHttpServer())
        .post('/acl/roles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: ROLE_NAME })
        .expect(403);
    });

    it('RH cria role → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/acl/roles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: ROLE_NAME })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      roleId = res.body.id;
    });

    it('GET /acl/roles — lista com contagem de utilizadores → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/roles')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.id === roleId)).toBe(true);
    });

    it('GET /acl/roles/:id — detalhe → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/acl/roles/${roleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(roleId);
    });

    it('PATCH /acl/roles/:id — actualiza descrição → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/acl/roles/${roleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Role de teste de integração' })
        .expect(200);
      expect(res.body.description).toBe('Role de teste de integração');
    });

    it('POST /acl/roles/:roleId/permissions/:permissionId — atribui permissão → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/acl/roles/${roleId}/permissions/${permissionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.permissions.some((p: any) => p.id === permissionId)).toBe(true);
    });

    it('GET /acl/roles/:roleId/permissions → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/acl/roles/${roleId}/permissions`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.permissions.some((p: any) => p.id === permissionId)).toBe(true);
    });

    it('POST /acl/roles/:id/clone — clona role com as suas permissões → 201', async () => {
      // Nota: Permission.roleId é uma FK 1:N de dono único (não M2M) — "clonar"
      // na prática move a posse da permissão para o clone, não a duplica. Não
      // apagamos o clone aqui (o cleanup de roles no afterAll trata disso,
      // reatribuindo a permissão ao ADMIN antes de apagar qualquer role de teste).
      const res = await request(app.getHttpServer())
        .post(`/acl/roles/${roleId}/clone`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ newName: `${ROLE_NAME} (clone)` })
        .expect(201);
      expect(res.body.permissions.some((p: any) => p.id === permissionId)).toBe(true);
    });
  });

  describe('Matriz de permissões', () => {
    it('GET /acl/matrix — ADMIN → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/matrix')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('roles');
      expect(res.body).toHaveProperty('matrix');
    });

    it('GET /acl/matrix — colaborador → 403', async () => {
      await request(app.getHttpServer())
        .get('/acl/matrix')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });
  });

  describe('Políticas (ABAC/PBAC) — modelo pode estar ausente', () => {
    it('GET /acl/policies — degrada sem crashar → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });

    it('POST /acl/policies — degrada sem crashar → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/acl/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Política de teste',
          condition: JSON.stringify({ roleCode: 'COLABORADOR' }),
          effect: 'DENY',
        })
        .expect(201);
      expect(res.body).toBeDefined();
    });
  });

  describe('Bulk assign', () => {
    it('POST /acl/roles/bulk-assign — atribui várias permissões → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/acl/roles/bulk-assign')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ roleId, permissionIds: [permissionId] })
        .expect(201);
      expect(res.body.permissions.some((p: any) => p.id === permissionId)).toBe(true);
    });
  });

  describe('User ↔ Role', () => {
    it('POST /acl/users/assign-role — ADMIN atribui role a utilizador → 201', async () => {
      const me = await request(app.getHttpServer())
        .get('/acl/my-permissions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/acl/users/assign-role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: me.body.userId, roleId })
        .expect(201);
      expect(res.body.roleId).toBe(roleId);

      // Reverter para não afectar outros testes que dependem do papel COLABORADOR.
      const colaboradorRole = await prisma.role.findFirst({ where: { code: 'COLABORADOR' } });
      if (colaboradorRole) {
        await prisma.user.update({
          where: { id: me.body.userId },
          data: { roleId: colaboradorRole.id },
        });
      }
    });

    it('POST /acl/users/assign-role — colaborador não pode → 403', async () => {
      await request(app.getHttpServer())
        .post('/acl/users/assign-role')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: 1, roleId })
        .expect(403);
    });
  });

  describe('Audit e stats', () => {
    it('GET /acl/audit — ADMIN → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /acl/audit/denied → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/audit/denied')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /acl/stats → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('roleBreakdown');
    });
  });

  describe('Revogação de permissão', () => {
    it('DELETE /acl/roles/:roleId/permissions/:permissionId → 204', async () => {
      await request(app.getHttpServer())
        .delete(`/acl/roles/${roleId}/permissions/${permissionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(204);
    });
  });
});
