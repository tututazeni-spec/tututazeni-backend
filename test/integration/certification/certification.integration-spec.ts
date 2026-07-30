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
const OTHER_EMPLOYEE_EMAIL = 'int.certification.other@innova-test.com';

describe('Certification Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let otherEmployeeToken: string;
  let employeeId: number;

  let templateId: string;
  let certificateId: string;
  let verificationCode: string;
  let badgeId: string;

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
    rhToken = await getToken(app.getHttpServer(), 'rh');

    const employeeUser = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employeeUser!.id;

    const colaboradorRole = await prisma.role.findUnique({ where: { code: 'COLABORADOR' } });
    const dept = await prisma.department.findUnique({ where: { code: 'DEPT-INT-TEST' } });
    const password = await bcrypt.hash('Test@1234', 10);
    await prisma.user.upsert({
      where: { email: OTHER_EMPLOYEE_EMAIL },
      update: {},
      create: {
        email: OTHER_EMPLOYEE_EMAIL,
        fullName: 'Outro Colaborador Certification',
        password,
        roleId: colaboradorRole!.id,
        departmentId: dept!.id,
        active: true,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: OTHER_EMPLOYEE_EMAIL, password: 'Test@1234' })
      .expect(201);
    otherEmployeeToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (certificateId)
      await (prisma as any).issuedCertificate
        .deleteMany({ where: { id: certificateId } })
        .catch(() => undefined);
    if (templateId)
      await (prisma as any).certificateTemplate
        .deleteMany({ where: { id: templateId } })
        .catch(() => undefined);
    if (badgeId) {
      // BadgeIssuance referencia badgeId com FK RESTRICT — tem de ser
      // eliminado antes do badge, senão a eliminação falha silenciosamente
      // (catch) e o registo fica órfão, bloqueando reexecuções futuras.
      await (prisma as any).badgeIssuance.deleteMany({ where: { badgeId } }).catch(() => undefined);
      await (prisma as any).digitalBadge
        .deleteMany({ where: { id: badgeId } })
        .catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: OTHER_EMPLOYEE_EMAIL } }).catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Templates (Admin/RH)', () => {
    it('colaborador não pode criar template → 403', async () => {
      await request(app.getHttpServer())
        .post('/certification/templates')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ name: 'Template Integração', html: '<p>{{recipientName}}</p>' })
        .expect(403);
    });

    it('RH cria template → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/certification/templates')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ name: 'Template Integração', html: '<p>{{recipientName}} — {{title}}</p>' })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      templateId = res.body.id;
    });

    it('lista templates → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/certification/templates')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Emissão de certificados', () => {
    it('colaborador não pode emitir certificado → 403', async () => {
      await request(app.getHttpServer())
        .post('/certification/certificates')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ userId: employeeId, title: 'Curso de Integração' })
        .expect(403);
    });

    it('RH emite certificado para o colaborador → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/certification/certificates')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: employeeId, title: 'Curso de Integração', templateId })
        .expect(201);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('verificationCode');
      certificateId = res.body.id;
      verificationCode = res.body.verificationCode;
    });

    it('emitir para utilizador inexistente → 404', async () => {
      await request(app.getHttpServer())
        .post('/certification/certificates')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ userId: 999999, title: 'Curso Fantasma' })
        .expect(404);
    });

    it('dono vê o certificado próprio em my-certificates → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/certification/my-certificates')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.data.some((c: any) => c.id === certificateId)).toBe(true);
    });

    it('dono vê o detalhe do certificado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/certification/certificates/${certificateId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', certificateId);
    });

    it('outro colaborador não pode ver certificado alheio → 404', async () => {
      await request(app.getHttpServer())
        .get(`/certification/certificates/${certificateId}`)
        .set('Authorization', `Bearer ${otherEmployeeToken}`)
        .expect(404);
    });

    it('certificado inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/certification/certificates/nao-existe')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(404);
    });

    it('dono faz download do certificado (regista contagem) → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/certification/certificates/${certificateId}/download`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201);
      expect(res.body).toHaveProperty('publicUrl');
    });
  });

  describe('Verificação pública (sem autenticação)', () => {
    it('código válido → valid:true com dados do certificado', async () => {
      const res = await request(app.getHttpServer())
        .get(`/certification/verify/${verificationCode}`)
        .expect(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.certificate).toHaveProperty('code');
    });

    it('código inválido → valid:false', async () => {
      const res = await request(app.getHttpServer())
        .get('/certification/verify/CODIGO-INEXISTENTE')
        .expect(200);
      expect(res.body.valid).toBe(false);
    });
  });

  describe('Revogação', () => {
    it('colaborador não pode revogar → 403', async () => {
      await request(app.getHttpServer())
        .put(`/certification/certificates/${certificateId}/revoke`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ reason: 'tentativa indevida de revogação' })
        .expect(403);
    });

    it('RH revoga o certificado → 200', async () => {
      const res = await request(app.getHttpServer())
        .put(`/certification/certificates/${certificateId}/revoke`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'emitido com dados incorrectos' })
        .expect(200);
      expect(res.body.isRevoked).toBe(true);
    });

    it('revogar certificado já revogado → 409', async () => {
      await request(app.getHttpServer())
        .put(`/certification/certificates/${certificateId}/revoke`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ reason: 'segunda tentativa' })
        .expect(409);
    });

    it('verificação pública reflecte a revogação → valid:false', async () => {
      const res = await request(app.getHttpServer())
        .get(`/certification/verify/${verificationCode}`)
        .expect(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toMatch(/revogado/i);
    });
  });

  describe('Badges digitais', () => {
    it('colaborador não pode criar badge → 403', async () => {
      await request(app.getHttpServer())
        .post('/certification/badges')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({
          name: 'Badge Integração',
          description: 'x',
          imageUrl: 'https://x.test/b.png',
          criteria: 'y',
        })
        .expect(403);
    });

    it('RH cria badge → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/certification/badges')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({
          name: 'Badge Integração',
          description: 'x',
          imageUrl: 'https://x.test/b.png',
          criteria: 'y',
        })
        .expect(201);
      badgeId = res.body.id;
    });

    it('lista badges → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/certification/badges')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('RH atribui badge ao colaborador → 201', async () => {
      await request(app.getHttpServer())
        .post('/certification/badges/issue')
        .set('Authorization', `Bearer ${rhToken}`)
        .send({ badgeId, userId: employeeId })
        .expect(201);
    });

    it('colaborador vê os seus badges → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/certification/my-badges')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.some((b: any) => b.badgeId === badgeId)).toBe(true);
    });
  });

  describe('Dashboard', () => {
    it('colaborador não acede ao dashboard → 403', async () => {
      await request(app.getHttpServer())
        .get('/certification/dashboard')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH acede ao dashboard → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/certification/dashboard')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });
});
