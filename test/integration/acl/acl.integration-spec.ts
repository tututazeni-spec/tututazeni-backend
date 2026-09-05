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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    adminToken = await getToken(app.getHttpServer(), 'admin');
    rhToken = await getToken(app.getHttpServer(), 'rh');
    employeeToken = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => {
    // M2M via RolePermission: Permission já não tem dono único (roleId foi
    // removido — ver project-innova-acl-permission-ownership). Apagar os
    // roles de teste só remove as linhas de associação (ON DELETE CASCADE em
    // RolePermission.roleId); a permissão do catálogo sobrevive e é apagada
    // à parte, sem nenhuma dança de reatribuição prévia.
    await prisma.role
      .deleteMany({ where: { name: { contains: 'Int Test Role' } } })
      .catch(() => undefined);
    await prisma.permission.deleteMany({ where: { name: PERMISSION_NAME } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('my-permissions', () => {
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

    it('POST /acl/roles/:id/clone — clona role duplicando as suas permissões (o original mantém as próprias)', async () => {
      // M2M via RolePermission: clonar cria novas linhas de associação para o
      // clone — o role de origem continua a ter a permissão, não é "roubada".
      const res = await request(app.getHttpServer())
        .post(`/acl/roles/${roleId}/clone`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ newName: `${ROLE_NAME} (clone)` })
        .expect(201);
      expect(res.body.permissions.some((p: any) => p.id === permissionId)).toBe(true);

      const original = await request(app.getHttpServer())
        .get(`/acl/roles/${roleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(original.body.permissions.some((p: any) => p.id === permissionId)).toBe(true);
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

  describe('ABAC removido (Fase D) — rotas de políticas deixaram de existir', () => {
    it('GET /acl/policies → 404', async () => {
      await request(app.getHttpServer())
        .get('/acl/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('POST /acl/policies → 404', async () => {
      await request(app.getHttpServer())
        .post('/acl/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'x', condition: '{}', effect: 'DENY' })
        .expect(404);
    });

    it('POST /acl/check → 404', async () => {
      await request(app.getHttpServer())
        .post('/acl/check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: 1, action: 'VIEW', subject: 'DASHBOARD' })
        .expect(404);
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

  describe('Paridade dos 3 namespaces (Fase D — serviço único)', () => {
    it('role criado em /roles-permissions é visível e idêntico em /acl/roles/:id e /roles/:id', async () => {
      const created = await request(app.getHttpServer())
        .post('/roles-permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Int Test Role — Parity', code: 'INT_TEST_PARITY' })
        .expect(201);
      const id = created.body.id;

      try {
        const viaAcl = await request(app.getHttpServer())
          .get(`/acl/roles/${id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        const viaDept = await request(app.getHttpServer())
          .get(`/roles/${id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(viaAcl.body.name).toBe('Int Test Role — Parity');
        expect(viaDept.body.name).toBe('Int Test Role — Parity');
        expect(viaAcl.body.id).toBe(id);
        expect(viaDept.body.id).toBe(id);
      } finally {
        await prisma.rolePermission.deleteMany({ where: { roleId: id } }).catch(() => undefined);
        await prisma.role.delete({ where: { id } }).catch(() => undefined);
      }
    });

    it('GET /acl/roles/:id inexistente → 200 sem role (adaptador preserva o contrato histórico, não 404)', async () => {
      const res = await request(app.getHttpServer())
        .get('/acl/roles/99999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).not.toHaveProperty('id');
    });
  });
});
