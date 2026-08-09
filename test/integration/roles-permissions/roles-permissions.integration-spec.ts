import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Roles Permissions Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const roleIds: number[] = [];
  const permissionIds: number[] = [];

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
  });

  afterAll(async () => {
    await prisma.permission.deleteMany({ where: { id: { in: permissionIds } } }).catch(() => {});
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Autenticação e RBAC (tier ADMIN/RH)', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/roles-permissions').expect(401);
    });

    it('colaborador não acede', async () => {
      await request(app.getHttpServer())
        .get('/roles-permissions')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('gestor não acede (tier ADMIN/RH apenas)', async () => {
      await request(app.getHttpServer())
        .get('/roles-permissions')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('RH e ADMIN acedem', async () => {
      await request(app.getHttpServer())
        .get('/roles-permissions')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/roles-permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Roles CRUD', () => {
    let roleId: number;

    it('RH cria role', async () => {
      const res = await request(app.getHttpServer())
        .post('/roles-permissions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Role A', description: 'Role de teste' })
        .expect(201);
      roleId = res.body.id;
      roleIds.push(roleId);
      expect(res.body.code).toBe('INT_TEST_ROLE_A');
    });

    it('nome duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/roles-permissions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Role A' })
        .expect(409);
    });

    it('GET /:id devolve o detalhe', async () => {
      const res = await request(app.getHttpServer())
        .get(`/roles-permissions/${roleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(roleId);
    });

    it('PUT actualiza descrição', async () => {
      const res = await request(app.getHttpServer())
        .put(`/roles-permissions/${roleId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ description: 'Descrição actualizada' })
        .expect(200);
      expect(res.body.description).toBe('Descrição actualizada');
    });

    it('GET /users-without-role e /:id/users não rebentam', async () => {
      await request(app.getHttpServer())
        .get('/roles-permissions/users-without-role')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/roles-permissions/${roleId}/users`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });

  describe('Permissões — M2M via RolePermission (ver project-innova-acl-permission-ownership)', () => {
    let roleId: number;
    let permA: number;
    let permB: number;
    let permC: number;

    beforeAll(async () => {
      const role = await prisma.role.create({
        data: { name: 'Int Test Role Perms', code: 'INT_TEST_ROLE_PERMS' },
      });
      roleId = role.id;
      roleIds.push(roleId);

      // Permission já não tem roleId (removido — catálogo independente,
      // associação só existe via RolePermission).
      const a = await prisma.permission.create({
        data: { name: 'int-test:read-a', action: 'VIEW', subject: 'USERS' },
      });
      const b = await prisma.permission.create({
        data: { name: 'int-test:read-b', action: 'VIEW', subject: 'REPORTS' },
      });
      const c = await prisma.permission.create({
        data: { name: 'int-test:read-c', action: 'VIEW', subject: 'LMS' },
      });
      permA = a.id;
      permB = b.id;
      permC = c.id;
      permissionIds.push(permA, permB, permC);
    });

    it('adiciona permissões A e B ao role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/roles-permissions/${roleId}/permissions/add`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ permissionIds: [permA, permB] })
        .expect(200);
      expect(res.body.permissions.map((p: any) => p.id).sort()).toEqual([permA, permB].sort());
    });

    it('remover a permissão A é um delete real da associação, sem afectar o catálogo', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/roles-permissions/${roleId}/permissions/remove`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ permissionIds: [permA] })
        .expect(200);
      expect(res.body.permissions.map((p: any) => p.id)).toEqual([permB]);
    });

    it('a permissão removida continua a existir no catálogo — só deixou de pertencer a este role', async () => {
      const perm = await prisma.permission.findUnique({ where: { id: permA } });
      expect(perm).not.toBeNull();
    });

    it('setRolePermissions substitui B por C via diff (deleteMany + createMany)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/roles-permissions/${roleId}/permissions/set`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ permissionIds: [permC] })
        .expect(200);
      expect(res.body.permissions.map((p: any) => p.id)).toEqual([permC]);
    });

    it('a permissão B libertada pelo set também continua a existir no catálogo', async () => {
      const perm = await prisma.permission.findUnique({ where: { id: permB } });
      expect(perm).not.toBeNull();
    });

    it('eliminar role com permissões associadas → 204 (cascata remove só RolePermission, nunca o catálogo)', async () => {
      await request(app.getHttpServer())
        .delete(`/roles-permissions/${roleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
      roleIds.splice(roleIds.indexOf(roleId), 1);

      const perm = await prisma.permission.findUnique({ where: { id: permC } });
      expect(perm).not.toBeNull();
    });
  });

  describe('Clone — M2M via RolePermission duplica, não move a posse', () => {
    let sourceId: number;
    let cloneId: number;
    let permId: number;

    it('cria role de origem com uma permissão e clona', async () => {
      const source = await request(app.getHttpServer())
        .post('/roles-permissions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Clone Source' })
        .expect(201);
      sourceId = source.body.id;
      roleIds.push(sourceId);

      const perm = await prisma.permission.create({
        data: { name: 'int-test:clone-perm', action: 'VIEW', subject: 'DASHBOARD' },
      });
      permId = perm.id;
      permissionIds.push(permId);

      await request(app.getHttpServer())
        .patch(`/roles-permissions/${sourceId}/permissions/add`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ permissionIds: [permId] })
        .expect(200);

      const clone = await request(app.getHttpServer())
        .post(`/roles-permissions/${sourceId}/clone`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ newName: 'Int Test Clone Target' })
        .expect(201);
      cloneId = clone.body.id;
      roleIds.push(cloneId);
      expect(clone.body.permissions.map((p: any) => p.id)).toEqual([permId]);
    });

    it('a permissão passou a pertencer também ao clone — o role de origem mantém-na', async () => {
      const source = await request(app.getHttpServer())
        .get(`/roles-permissions/${sourceId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(source.body.permissions.map((p: any) => p.id)).toEqual([permId]);
    });
  });

  describe('Atribuição de roles a utilizadores', () => {
    let roleId: number;
    let originalRoleId: number | null;

    beforeAll(async () => {
      const role = await prisma.role.create({
        data: { name: 'Int Test Assign Role', code: 'INT_TEST_ASSIGN_ROLE' },
      });
      roleId = role.id;
      roleIds.push(roleId);
      const employee = await prisma.user.findUnique({ where: { id: employeeId } });
      originalRoleId = employee!.roleId;
    });

    afterAll(async () => {
      await prisma.user.update({ where: { id: employeeId }, data: { roleId: originalRoleId } });
    });

    it('atribui o role ao colaborador', async () => {
      const res = await request(app.getHttpServer())
        .post(`/roles-permissions/${roleId}/assign/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.user.roleId).toBe(roleId);
    });

    it('bulk-assign atribui a múltiplos utilizadores', async () => {
      const res = await request(app.getHttpServer())
        .post('/roles-permissions/bulk-assign')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ roleId, userIds: [employeeId] })
        .expect(201);
      expect(res.body.succeeded).toBe(1);
    });
  });

  describe('Governança, matriz, comparação e simulador', () => {
    it('governance-stats', async () => {
      const res = await request(app.getHttpServer())
        .get('/roles-permissions/governance-stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.totalRoles).toBeGreaterThanOrEqual(1);
    });

    it('matrix', async () => {
      const res = await request(app.getHttpServer())
        .get('/roles-permissions/matrix')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(Array.isArray(res.body.matrix)).toBe(true);
    });

    it('compare entre dois roles', async () => {
      const rA = await prisma.role.create({
        data: { name: 'Int Test Compare A', code: 'INT_TEST_CMP_A' },
      });
      const rB = await prisma.role.create({
        data: { name: 'Int Test Compare B', code: 'INT_TEST_CMP_B' },
      });
      roleIds.push(rA.id, rB.id);

      const res = await request(app.getHttpServer())
        .get(`/roles-permissions/compare/${rA.id}/${rB.id}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.overlap).toBe(0);
    });

    it('simulador de permissão para o colaborador', async () => {
      const res = await request(app.getHttpServer())
        .post('/roles-permissions/simulate')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, resource: 'reports', action: 'export' })
        .expect(201);
      expect(res.body.allowed).toBeDefined();
      expect(res.body.chain.length).toBe(3);
    });
  });

  describe('Templates de posição', () => {
    it('getTemplates não rebenta mesmo se modelo estiver ausente/vazio', async () => {
      await request(app.getHttpServer())
        .get('/roles-permissions/templates/positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
    });
  });
});
