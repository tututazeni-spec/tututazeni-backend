import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Departments Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let departmentId: number;
  let childDepartmentId: number;
  let unitId: number;
  let positionId: number;
  let roleId: number;
  let permissionId: number;
  let careerPositionId: number;
  let employeeId: number;
  let employeeOriginalDepartmentId: number | null;

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
    employeeOriginalDepartmentId = employee!.departmentId;
  });

  afterAll(async () => {
    // O teste de transferência reatribui int.employee a um departamento criado
    // por este spec — restaurar antes de eliminar esse departamento, para não
    // deixar o utilizador partilhado com departmentId NULL (via SetNull da FK)
    // para o resto da suite.
    await prisma.user
      .update({ where: { id: employeeId }, data: { departmentId: employeeOriginalDepartmentId } })
      .catch(() => undefined);
    if (careerPositionId) {
      await prisma.userCareer
        .deleteMany({ where: { positionId: careerPositionId } })
        .catch(() => undefined);
      await prisma.positionCompetency
        .deleteMany({ where: { positionId: careerPositionId } })
        .catch(() => undefined);
      await prisma.careerPosition
        .deleteMany({ where: { id: careerPositionId } })
        .catch(() => undefined);
    }
    if (permissionId) {
      await prisma.permission.deleteMany({ where: { id: permissionId } }).catch(() => undefined);
    }
    if (roleId) {
      await prisma.rolePermission.deleteMany({ where: { roleId } }).catch(() => undefined);
      await prisma.role.deleteMany({ where: { id: roleId } }).catch(() => undefined);
    }
    if (positionId) {
      await prisma.position.deleteMany({ where: { id: positionId } }).catch(() => undefined);
    }
    if (childDepartmentId) {
      await prisma.departmentTransferLog
        .deleteMany({
          where: {
            OR: [{ fromDepartmentId: childDepartmentId }, { toDepartmentId: childDepartmentId }],
          },
        })
        .catch(() => undefined);
      await prisma.departmentHeadHistory
        .deleteMany({ where: { departmentId: childDepartmentId } })
        .catch(() => undefined);
      await prisma.department
        .deleteMany({ where: { id: childDepartmentId } })
        .catch(() => undefined);
    }
    if (departmentId) {
      await prisma.departmentTransferLog
        .deleteMany({
          where: { OR: [{ fromDepartmentId: departmentId }, { toDepartmentId: departmentId }] },
        })
        .catch(() => undefined);
      await prisma.departmentHeadHistory
        .deleteMany({ where: { departmentId } })
        .catch(() => undefined);
      await prisma.department.deleteMany({ where: { id: departmentId } }).catch(() => undefined);
    }
    if (unitId) {
      await prisma.unit.deleteMany({ where: { id: unitId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Departments CRUD e hierarquia', () => {
    it('colaborador não pode criar departamento → 403', async () => {
      await request(app.getHttpServer())
        .post('/departments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'X', code: 'X-001' })
        .expect(403);
    });

    it('RH cria departamento → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Department', code: 'INT-DEPT-001' })
        .expect(201);
      departmentId = res.body.id;
      expect(departmentId).toBeDefined();
    });

    it('RH cria sub-departamento (hierarquia) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Int Test Sub-Department', code: 'INT-DEPT-002', parentId: departmentId })
        .expect(201);
      childDepartmentId = res.body.id;
      expect(res.body.parent.id).toBe(departmentId);
    });

    it('RH cria departamento com código duplicado → 409', async () => {
      await request(app.getHttpServer())
        .post('/departments')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Duplicado', code: 'INT-DEPT-001' })
        .expect(409);
    });

    it('tentar criar hierarquia circular → 400', async () => {
      await request(app.getHttpServer())
        .put(`/departments/${departmentId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ parentId: childDepartmentId })
        .expect(400);
    });

    it('GET /departments — qualquer autenticado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/departments')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((d: any) => d.id === departmentId)).toBe(true);
    });

    it('GET /departments/tree — 200 e inclui a hierarquia criada', async () => {
      const res = await request(app.getHttpServer())
        .get('/departments/tree')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const node = res.body.find((d: any) => d.id === departmentId);
      expect(node.children.some((c: any) => c.id === childDepartmentId)).toBe(true);
    });

    it('GET /departments/:id — 200 com membros e breadcrumb', async () => {
      const res = await request(app.getHttpServer())
        .get(`/departments/${departmentId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.id).toBe(departmentId);
      expect(Array.isArray(res.body.children)).toBe(true);
    });

    it('GET /departments/:id/metrics — 200 com breadcrumb', async () => {
      const res = await request(app.getHttpServer())
        .get(`/departments/${childDepartmentId}/metrics`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.breadcrumb.map((b: any) => b.id)).toEqual([departmentId, childDepartmentId]);
    });

    it('transfere colaborador para o departamento → 201', async () => {
      await request(app.getHttpServer())
        .post('/departments/members/transfer')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, targetDepartmentId: departmentId, reason: 'Reestruturação' })
        .expect(201);

      const user = await prisma.user.findUnique({ where: { id: employeeId } });
      expect(user!.departmentId).toBe(departmentId);
    });

    it('GET /departments/:id/transfer-history — 200 regista a transferência', async () => {
      const res = await request(app.getHttpServer())
        .get(`/departments/${departmentId}/transfer-history`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.some((t: any) => t.user.id === employeeId)).toBe(true);
    });

    it('GET /departments/dashboard/comparative — RH/gestor → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/departments/dashboard/comparative')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.some((d: any) => d.id === departmentId)).toBe(true);
    });

    it('desactivar departamento com colaboradores activos → 400', async () => {
      await request(app.getHttpServer())
        .patch(`/departments/${departmentId}/deactivate`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(400);
    });
  });

  describe('Units — verifica correcção (tipo→type, departmentId liga ao Department correcto)', () => {
    it('RH cria unidade com "type" (schema real, nao "tipo") → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/units')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Unidade Teste Integração', type: 'HEADQUARTERS', departmentId })
        .expect(201);
      unitId = res.body.id;
      expect(res.body.type).toBe('HEADQUARTERS');

      const dept = await prisma.department.findUnique({ where: { id: departmentId } });
      expect(dept!.unitId).toBe(unitId);
    });

    it('GET /units/:id — 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/units/${unitId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(unitId);
    });
  });

  describe('Positions — verifica correcção (departmentId/salaryMin/salaryMax reais, nao department/baseSalary)', () => {
    it('RH cria posição → 201 e persiste os campos reais do schema', async () => {
      const res = await request(app.getHttpServer())
        .post('/positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Int Test Position',
          level: 'SENIOR',
          departmentId,
          salaryMin: 1000,
          salaryMax: 2000,
        })
        .expect(201);
      positionId = res.body.id;
      expect(res.body.departmentId).toBe(departmentId);
      expect(res.body.salaryMin).toBe(1000);
      expect(res.body.salaryMax).toBe(2000);
    });

    it('GET /positions/:id — 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/positions/${positionId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.id).toBe(positionId);
    });
  });

  describe('Roles & Permissions — verifica correcção (assignPermissionToRole sem @@unique)', () => {
    it('RH não pode criar role → 403', async () => {
      await request(app.getHttpServer())
        .post('/roles')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'INT_TEST_ROLE' })
        .expect(403);
    });

    it('admin cria role → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'INT_TEST_ROLE', description: 'Role de teste de integração' })
        .expect(201);
      roleId = res.body.id;
      expect(roleId).toBeDefined();
    });

    it('admin cria permissão (sempre atribuída ao ADMIN por desenho) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/roles/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'int:test:permission', action: 'VIEW', subject: 'USERS' })
        .expect(201);
      permissionId = res.body.id;
      expect(permissionId).toBeDefined();
    });

    it('admin atribui a permissão à role de teste — verifica correcção (upsert por chave composta inexistente rebentava) → 201', async () => {
      await request(app.getHttpServer())
        .post(`/roles/${roleId}/permissions/${permissionId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const link = await prisma.rolePermission.findFirst({ where: { roleId, permissionId } });
      expect(link).toBeTruthy();
    });

    it('atribuição repetida é idempotente (não duplica) → 201', async () => {
      await request(app.getHttpServer())
        .post(`/roles/${roleId}/permissions/${permissionId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const links = await prisma.rolePermission.findMany({ where: { roleId, permissionId } });
      expect(links).toHaveLength(1);
    });

    it('admin revoga a permissão da role → 200', async () => {
      await request(app.getHttpServer())
        .delete(`/roles/${roleId}/permissions/${permissionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const link = await prisma.rolePermission.findFirst({ where: { roleId, permissionId } });
      expect(link).toBeNull();
    });

    it('GET /roles — 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.some((r: any) => r.id === roleId)).toBe(true);
    });
  });

  describe('Careers — verifica correcção (description obrigatório, alinhado ao schema)', () => {
    it('sem description → 400 (validação, antes 500 no Prisma)', async () => {
      await request(app.getHttpServer())
        .post('/careers/positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ title: 'Int Test Career Position', level: 'JUNIOR' })
        .expect(400);
    });

    it('RH cria posição de carreira com description → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/careers/positions')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          title: 'Int Test Career Position',
          description: 'Posição de carreira para testes de integração',
          level: 'JUNIOR',
        })
        .expect(201);
      careerPositionId = res.body.id;
      expect(careerPositionId).toBeDefined();
    });

    it('GET /careers/ladder — 200 inclui a posição criada', async () => {
      const res = await request(app.getHttpServer())
        .get('/careers/ladder')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((p: any) => p.id === careerPositionId)).toBe(true);
    });

    it('atribui a posição de carreira ao colaborador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/careers/users/${employeeId}/assign/${careerPositionId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(201);
      expect(res.body.positionId).toBe(careerPositionId);
    });

    it('GET /careers/my — colaborador vê o próprio histórico → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/careers/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((h: any) => h.positionId === careerPositionId)).toBe(true);
    });
  });
});
