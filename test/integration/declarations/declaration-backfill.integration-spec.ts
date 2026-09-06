import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { backfillDeclarationRequests } from '../../../prisma/backfill-declaration-requests';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Fase E — backfill DeclarationRequest -> Declaration', () => {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  let userId: number;
  let reviewerId: number;
  let templateId: number;
  let purposeId: number;
  const reqIds: number[] = [];

  beforeAll(async () => {
    const emp = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    const rh = await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } });
    userId = emp!.id;
    reviewerId = rh!.id;

    const tenant =
      (await prisma.tenantConfig.findFirst()) ??
      (await prisma.tenantConfig.create({
        data: { tenantCode: 'DEFAULT', tenantName: 'Default Tenant' },
      }));

    const purpose = await prisma.declarationPurpose.create({
      data: { name: 'Backfill E2E', category: 'LEGAL' },
    });
    purposeId = purpose.id;

    const tmpl = await prisma.declarationTemplate.create({
      data: {
        name: 'Backfill Template',
        tenantId: tenant.id,
        type: 'CUSTOM',
        language: 'PT',
        locale: 'PT',
        content: 'Olá {{employee_name}}',
        bodyContent: 'Olá {{employee_name}}',
        variables: ['employee_name'],
        createdById: reviewerId,
      },
    });
    templateId = tmpl.id;

    const mk = (over: Record<string, unknown>) =>
      prisma.declarationRequest.create({
        data: {
          userId,
          templateId,
          purposeId,
          language: 'PT',
          ...over,
        } as never,
      });

    reqIds.push((await mk({ status: 'PENDING', referenceNumber: 'BF-REF-PENDING' })).id);
    reqIds.push(
      (
        await mk({
          status: 'APPROVED',
          referenceNumber: 'BF-REF-APPROVED',
          addressedTo: 'Banco X',
          observations: 'para efeitos bancários',
        })
      ).id,
    );
    reqIds.push(
      (
        await mk({
          status: 'ISSUED',
          referenceNumber: 'BF-REF-ISSUED',
          verificationCode: 'BF-VER-ISSUED',
          generatedContent: '<p>gerado</p>',
          issuedAt: new Date('2026-02-01'),
        })
      ).id,
    );
    const rejected = await mk({ status: 'REJECTED', referenceNumber: 'BF-REF-REJECTED' });
    reqIds.push(rejected.id);
    await prisma.declarationApproval.create({
      data: {
        requestId: rejected.id,
        reviewerId,
        approved: false,
        notes: 'documentação insuficiente',
        reviewedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.declaration
      .deleteMany({ where: { legacyRequestId: { in: reqIds } } })
      .catch(() => undefined);
    await prisma.declarationApproval
      .deleteMany({ where: { requestId: { in: reqIds } } })
      .catch(() => undefined);
    await prisma.declarationRequest
      .deleteMany({ where: { id: { in: reqIds } } })
      .catch(() => undefined);
    await prisma.declarationTemplate
      .deleteMany({ where: { id: templateId } })
      .catch(() => undefined);
    await prisma.declarationPurpose.deleteMany({ where: { id: purposeId } }).catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
  });

  it('migra cada request preservando legacyRequestId, legacyStatus e o mapeamento de estado', async () => {
    const r1 = await backfillDeclarationRequests(prisma);
    expect(r1.created).toBeGreaterThanOrEqual(4);

    const rows = await prisma.declaration.findMany({
      where: { legacyRequestId: { in: reqIds } },
      orderBy: { legacyRequestId: 'asc' },
    });
    expect(rows).toHaveLength(4);

    const byLegacy = Object.fromEntries(rows.map(d => [d.legacyRequestId, d]));

    const pending = byLegacy[reqIds[0]];
    expect(pending.employeeId).toBe(userId);
    expect(pending.requestedById).toBe(userId);
    expect(pending.code).toBe('LEG-BF-REF-PENDING');
    expect(pending.legacyStatus).toBe('PENDING');
    expect(pending.status).toBe('PENDING_SIGNATURE');
    expect(pending.legacyPurposeId).toBe(purposeId);
    expect(pending.purpose).toBe('Backfill E2E');

    const approved = byLegacy[reqIds[1]];
    expect(approved.legacyStatus).toBe('APPROVED');
    expect(approved.status).toBe('PENDING_SIGNATURE');
    expect(approved.requestNotes).toContain('para efeitos bancários');
    expect(approved.requestNotes).toContain('Destinatário: Banco X');
    expect((approved.employeeSnapshot as Record<string, unknown>).addressedTo).toBe('Banco X');

    const issued = byLegacy[reqIds[2]];
    expect(issued.legacyStatus).toBe('ISSUED');
    expect(issued.status).toBe('ISSUED');
    expect(issued.renderedContent).toBe('<p>gerado</p>');
    expect(issued.verificationHash).toBe('LEG-BF-VER-ISSUED');
    expect(issued.issuedAt?.toISOString()).toBe(new Date('2026-02-01').toISOString());

    const rejected = byLegacy[reqIds[3]];
    expect(rejected.legacyStatus).toBe('REJECTED');
    expect(rejected.status).toBe('REVOKED');
    expect(rejected.rejectedReason).toBe('documentação insuficiente');
    expect(rejected.assignedToId).toBe(reviewerId);
  });

  it('é idempotente — segunda passagem não cria nem duplica', async () => {
    const r2 = await backfillDeclarationRequests(prisma);
    const createdThisRun = reqIds.filter(() => true).length;
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBeGreaterThanOrEqual(createdThisRun);

    for (const id of reqIds) {
      const count = await prisma.declaration.count({ where: { legacyRequestId: id } });
      expect(count).toBe(1);
    }
  });
});
