import { Prisma } from '@prisma/client';
import { CertificateIssuanceService } from './certificate-issuance.service';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

describe('CertificateIssuanceService', () => {
  const prisma = {
    certificateRule: { findUnique: jest.fn() },
    course: { findUnique: jest.fn() },
    enrollment: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    certificate: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notificationLog: { create: jest.fn() },
  };
  const facts = { collect: jest.fn() };
  const audit = { log: jest.fn() };
  const svc = new CertificateIssuanceService(prisma as never, facts as never, audit as never);

  const goodFacts = (over = {}) => ({
    title: 'Segurança',
    hours: 8,
    completionPct: 100,
    bestScore: 80,
    attendancePct: null,
    practicalPassed: null,
    instructorApproved: false,
    managerApproved: false,
    ...over,
  });
  const rule = (over = {}) => ({
    active: true,
    mode: 'AUTOMATIC',
    criteria: JSON.stringify({ requireFullCompletion: true, minScore: 70 }),
    validityDays: null,
    ...over,
  });
  const input = {
    userId: 1,
    activityKind: 'COURSE' as const,
    activityId: 10,
    trigger: 'AUTO' as const,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificate.findFirst.mockResolvedValue(null);
    prisma.enrollment.findUnique.mockResolvedValue({ id: 55 });
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Ana Silva' });
    prisma.certificate.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    facts.collect.mockResolvedValue(goodFacts());
  });

  it('TRAINING sem regra → NO_RULE e nada é criado', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    const r = await svc.issue({ ...input, activityKind: 'TRAINING' });
    expect(r.outcome).toBe('NO_RULE');
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('regra desactivada → NO_RULE', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule({ active: false }));
    expect((await svc.issue(input)).outcome).toBe('NO_RULE');
  });

  it('nota 69 com minScore 70 → NOT_ELIGIBLE, sem criar', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule());
    facts.collect.mockResolvedValue(goodFacts({ bestScore: 69 }));
    const r = await svc.issue(input);
    expect(r).toMatchObject({ outcome: 'NOT_ELIGIBLE', missing: ['MIN_SCORE_NOT_MET'] });
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('elegível → ISSUED com código aleatório, dedupKey, snapshot e auditoria', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule());
    const r = await svc.issue(input);
    expect(r.outcome).toBe('ISSUED');
    const data = prisma.certificate.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 1,
      courseId: 10,
      enrollmentId: 55,
      status: 'ACTIVE',
      dedupKey: '1:COURSE:10:1',
      recipientName: 'Ana Silva',
    });
    expect(data.validationCode).toMatch(/^[0-9A-Z]{16}$/);
    const snap = JSON.parse(data.snapshot);
    expect(snap).toMatchObject({
      recipientName: 'Ana Silva',
      title: 'Segurança',
      hours: 8,
      score: 80,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_ISSUED',
        entity: 'Certificate',
        strict: true,
      }),
    );
  });

  it('snapshot não inclui score quando não há nota', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(
      rule({ criteria: '{"requireFullCompletion":true}' }),
    );
    facts.collect.mockResolvedValue(goodFacts({ bestScore: null }));
    await svc.issue(input);
    expect(JSON.parse(prisma.certificate.create.mock.calls[0][0].data.snapshot)).not.toHaveProperty(
      'score',
    );
  });

  it('validityDays 365 → expiresAt ≈ +365 dias', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule({ validityDays: 365 }));
    await svc.issue(input);
    const exp: Date = prisma.certificate.create.mock.calls[0][0].data.expiresAt;
    const days = (exp.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364.9);
    expect(days).toBeLessThan(365.1);
  });

  it('certificado já existente (legado, sem dedupKey) → EXISTS sem criar', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule());
    prisma.certificate.findFirst.mockResolvedValue({ id: 9 });
    const r = await svc.issue(input);
    expect(r).toMatchObject({ outcome: 'EXISTS', certificate: { id: 9 } });
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('P2002 na criação (corrida) → EXISTS com o registo vencedor', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule());
    prisma.certificate.create.mockRejectedValue(p2002());
    prisma.certificate.findUnique.mockResolvedValue({ id: 7 });
    expect(await svc.issue(input)).toMatchObject({ outcome: 'EXISTS', certificate: { id: 7 } });
  });

  it('modo APPROVAL → PENDING_APPROVAL, sem notificação de emissão', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(
      rule({
        mode: 'APPROVAL',
        criteria: '{"requireFullCompletion":true,"requireManagerApproval":true}',
      }),
    );
    const r = await svc.issue(input);
    expect(r.outcome).toBe('PENDING_APPROVAL');
    expect(prisma.certificate.create.mock.calls[0][0].data.status).toBe('PENDING_APPROVAL');
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it('MANUAL sem actorId → rejeita', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule());
    await expect(svc.issue({ ...input, trigger: 'MANUAL' })).rejects.toThrow();
  });

  it('regra sem critérios → NOT_ELIGIBLE (NO_CRITERIA)', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule({ criteria: '{}' }));
    expect(await svc.issue(input)).toMatchObject({
      outcome: 'NOT_ELIGIBLE',
      missing: ['NO_CRITERIA'],
    });
  });

  it('approve passa PENDING_APPROVAL → ACTIVE e audita', async () => {
    prisma.certificate.findUnique.mockResolvedValue({
      id: 3,
      userId: 1,
      status: 'PENDING_APPROVAL',
    });
    prisma.certificate.update.mockImplementation(async ({ data }) => ({
      id: 3,
      userId: 1,
      ...data,
    }));
    const c = await svc.approve(3, 99);
    expect(c.status).toBe('ACTIVE');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CERTIFICATE_APPROVED', userId: 99 }),
    );
  });

  it('approve rejeita certificado que não está pendente', async () => {
    prisma.certificate.findUnique.mockResolvedValue({ id: 3, status: 'ACTIVE' });
    await expect(svc.approve(3, 99)).rejects.toThrow();
  });
});
