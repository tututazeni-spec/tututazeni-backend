import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditService } from '../../../src/common/services/audit.service';
import { MailService } from '../../../src/mail/mail.service';
import { CertificateFactsService } from '../../../src/certificates/certificate-facts.service';
import { CertificateIssuanceService } from '../../../src/certificates/certificate-issuance.service';
import { CertificateTemplatesService } from '../../../src/certificates/templates/certificate-templates.service';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Certificates issuance (Postgres real)', () => {
  let app: INestApplication;
  let svc: CertificateIssuanceService;
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  let userId: number;
  let courseId: number;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    const prismaService = app.get(PrismaService);
    svc = new CertificateIssuanceService(
      prismaService,
      new CertificateFactsService(prismaService),
      app.get(AuditService),
      app.get(CertificateTemplatesService),
      app.get(MailService),
    );

    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    userId = employee!.id;
    const course = await prisma.course.create({
      data: {
        title: 'Curso Certificados Issuance',
        internalCode: `INT-CERT-ISS-${Date.now()}`,
        description: 'x',
        status: 'PUBLISHED',
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    // filhos antes de pais: certificate → enrollment → course
    await prisma.certificate.deleteMany({ where: { courseId } }).catch((): undefined => undefined);
    await prisma.enrollment.deleteMany({ where: { courseId } }).catch((): undefined => undefined);
    await prisma.certificateRule
      .deleteMany({ where: { activityId: courseId } })
      .catch((): undefined => undefined);
    await prisma.course.deleteMany({ where: { id: courseId } }).catch((): undefined => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  it('sem conclusão não emite (matrícula em curso, progress 100)', async () => {
    await prisma.enrollment.create({
      data: { courseId, userId, status: 'IN_PROGRESS', progress: 100 },
    });
    const r = await svc.issue({
      userId,
      activityKind: 'COURSE',
      activityId: courseId,
      trigger: 'AUTO',
    });
    expect(r).toMatchObject({ outcome: 'NOT_ELIGIBLE', missing: ['COMPLETION_INCOMPLETE'] });
    expect(await prisma.certificate.count({ where: { courseId } })).toBe(0);
  });

  it('20 chamadas concorrentes geram 1 certificado', async () => {
    await prisma.enrollment.update({
      where: { courseId_userId: { courseId, userId } },
      data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        svc.issue({ userId, activityKind: 'COURSE', activityId: courseId, trigger: 'AUTO' }),
      ),
    );
    expect(results.filter(r => r.outcome === 'ISSUED')).toHaveLength(1);
    expect(results.filter(r => r.outcome === 'EXISTS')).toHaveLength(19);
    expect(await prisma.certificate.count({ where: { courseId } })).toBe(1);

    const cert = await prisma.certificate.findFirst({ where: { courseId } });
    expect(cert).toMatchObject({
      status: 'ACTIVE',
      activityKind: 'COURSE',
      dedupKey: `${userId}:COURSE:${courseId}:1`,
    });
    expect(cert!.validationCode).toMatch(/^[0-9A-Z]{16}$/);
  });
});
