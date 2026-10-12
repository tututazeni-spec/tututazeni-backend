import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const OTHER_EMPLOYEE_EMAIL = 'int.posreq.other@innova-test.com';

describe('Position requirements Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let otherEmployeeToken: string;
  let employeeId: number;
  let otherEmployeeId: number;
  let positionId: number;
  let positionDeleted = false;

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

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    rhToken = await getToken(app.getHttpServer(), 'rh');

    const employeeUser = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employeeUser!.id;

    const colaboradorRole = await prisma.role.findUnique({ where: { code: 'COLABORADOR' } });
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    const password = await bcrypt.hash('Test@1234', 10);
    const otherEmployee = await prisma.user.upsert({
      where: { email: OTHER_EMPLOYEE_EMAIL },
      update: {},
      create: {
        email: OTHER_EMPLOYEE_EMAIL,
        fullName: 'Outro Colaborador Requisitos',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });
    otherEmployeeId = otherEmployee.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: OTHER_EMPLOYEE_EMAIL, password: 'Test@1234' })
      .expect(201);
    otherEmployeeToken = loginRes.body.accessToken;

    const position = await prisma.position.create({ data: { name: 'INT Req Position' } });
    positionId = position.id;
  });

  afterAll(async () => {
    const userIds = [employeeId, otherEmployeeId].filter(Boolean);
    // filhos antes de pais; cada passo com .catch (convenção de teardown.ts)
    await prisma.userLanguage
      .deleteMany({ where: { userId: { in: userIds } } })
      .catch(() => undefined);
    await prisma.userQualification
      .deleteMany({ where: { userId: { in: userIds } } })
      .catch(() => undefined);
    await prisma.userExternalCertification
      .deleteMany({ where: { userId: { in: userIds } } })
      .catch(() => undefined);
    if (employeeId) {
      await prisma.user
        .update({ where: { id: employeeId }, data: { priorExperienceYears: null } })
        .catch(() => undefined);
    }
    if (positionId && !positionDeleted) {
      await prisma.positionRequirement.deleteMany({ where: { positionId } }).catch(() => undefined);
      await prisma.position.deleteMany({ where: { id: positionId } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: OTHER_EMPLOYEE_EMAIL } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Requisitos do cargo', () => {
    it('RH cria requisitos das 4 categorias e qualquer autenticado lista', async () => {
      for (const body of [
        { category: 'ACADEMIC', title: 'Informática', level: 'LICENCIATURA' },
        { category: 'EXPERIENCE', title: 'Experiência', minYears: 2 },
        { category: 'LANGUAGE', title: 'Inglês', level: 'B2' },
        { category: 'CERTIFICATION', title: 'AWS Cloud', mandatory: false },
      ]) {
        await request(app.getHttpServer())
          .post(`/career/positions/${positionId}/requirements`)
          .set('Authorization', `Bearer ${rhToken}`)
          .send(body)
          .expect(201);
      }
      const res = await request(app.getHttpServer())
        .get(`/career/positions/${positionId}/requirements`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveLength(4);
    });

    it('colaborador não cria requisitos → 403', async () => {
      await request(app.getHttpServer())
        .post(`/career/positions/${positionId}/requirements`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ category: 'LANGUAGE', title: 'Francês', level: 'A2' })
        .expect(403);
    });

    it('nível de idioma inválido → 400', async () => {
      await request(app.getHttpServer())
        .post(`/career/positions/${positionId}/requirements`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ category: 'LANGUAGE', title: 'Francês', level: 'FLUENTE' })
        .expect(400);
    });

    it('cargo inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/career/positions/999999/requirements')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ category: 'CERTIFICATION', title: 'AWS' })
        .expect(404);
    });
  });

  describe('Perfil do colaborador', () => {
    it('o colaborador regista o seu perfil e o RH lê-o', async () => {
      const base = `/users/${employeeId}`;
      await request(app.getHttpServer())
        .post(`${base}/languages`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ language: 'Inglês', level: 'C1' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`${base}/qualifications`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ degree: 'LICENCIATURA', course: 'Informática' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`${base}/experience`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ priorExperienceYears: 3 })
        .expect(200);

      const asRh = await request(app.getHttpServer())
        .get(`${base}/qualifications`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(asRh.body.languages).toHaveLength(1);
      expect(asRh.body.qualifications).toHaveLength(1);
      expect(asRh.body.priorExperienceYears).toBe(3);
    });

    it('outro colaborador não lê o perfil alheio → 404', async () => {
      await request(app.getHttpServer())
        .get(`/users/${employeeId}/qualifications`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });

    it('outro colaborador não escreve no perfil alheio → 404', async () => {
      await request(app.getHttpServer())
        .post(`/users/${employeeId}/languages`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .send({ language: 'Francês', level: 'A1' })
        .expect(404);
    });

    it('não apaga um item alheio através do próprio userId → 404', async () => {
      const mine = await prisma.userQualification.findFirst({ where: { userId: employeeId } });
      await request(app.getHttpServer())
        .delete(`/users/${otherEmployeeId}/qualifications/${mine!.id}`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
      expect(await prisma.userQualification.count({ where: { id: mine!.id } })).toBe(1);
    });
  });

  describe('Simulador', () => {
    it('devolve requirementChecks coerentes com o perfil', async () => {
      const res = await request(app.getHttpServer())
        .get(`/career/me/simulate/${positionId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      const byCat = Object.fromEntries(
        res.body.requirementChecks.map((c: { category: string; status: string }) => [
          c.category,
          c.status,
        ]),
      );
      expect(byCat.ACADEMIC).toBe('MET');
      expect(byCat.LANGUAGE).toBe('MET');
      expect(byCat.EXPERIENCE).toBe('MET'); // 3 anos anteriores >= 2
      // Sem nenhuma certificação (externa ou da plataforma) é NO_DATA; se o
      // colaborador tiver certificados da plataforma, nenhum chama "AWS Cloud".
      const certCount =
        (await prisma.certificate.count({ where: { userId: employeeId } })) +
        (await prisma.userExternalCertification.count({ where: { userId: employeeId } }));
      expect(byCat.CERTIFICATION).toBe(certCount === 0 ? 'NO_DATA' : 'NOT_MET');
      expect(res.body.summary.optionalTotal).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cascade', () => {
    it('apagar o cargo apaga os requisitos', async () => {
      await prisma.position.delete({ where: { id: positionId } });
      positionDeleted = true;
      expect(await prisma.positionRequirement.count({ where: { positionId } })).toBe(0);
    });
  });
});
