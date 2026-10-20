import { Prisma } from '@prisma/client';
import { CertificateIssuanceService } from './certificate-issuance.service';
import { BUILTIN_TEMPLATES } from './templates/builtin-templates';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

describe('CertificateIssuanceService', () => {
  const prisma = {
    certificateRule: { findUnique: jest.fn() },
    course: { findUnique: jest.fn() },
    training: { findUnique: jest.fn() },
    trainingSession: { findMany: jest.fn() },
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
  const templates = { resolveForIssuance: jest.fn() };
  const mail = { sendCertificateLink: jest.fn() };
  const svc = new CertificateIssuanceService(
    prisma as never,
    facts as never,
    audit as never,
    templates as never,
    mail as never,
  );
  const tpl = (id = 'tpl-1-corporativo-classico', version = 1) => ({
    id,
    version,
    config: (BUILTIN_TEMPLATES.find(t => t.id === id) ?? BUILTIN_TEMPLATES[0]).config,
  });

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
    prisma.trainingSession.findMany.mockResolvedValue([]);
    prisma.enrollment.findUnique.mockResolvedValue({ id: 55 });
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Ana Silva' });
    prisma.certificate.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    facts.collect.mockResolvedValue(goodFacts());
    templates.resolveForIssuance.mockResolvedValue(tpl());
  });

  it('TRAINING sem regra e com issueCertificate desligado → NO_RULE e nada é criado', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    prisma.training.findUnique.mockResolvedValue({ issueCertificate: false });
    const r = await svc.issue({ ...input, activityKind: 'TRAINING' });
    expect(r.outcome).toBe('NO_RULE');
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('TRAINING sem regra mas com issueCertificate → regra implícita de conclusão', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    prisma.training.findUnique.mockResolvedValue({ issueCertificate: true });
    facts.collect.mockResolvedValue(goodFacts({ bestScore: null }));
    const r = await svc.issue({ ...input, activityKind: 'TRAINING', activityId: 3 });
    expect(r.outcome).toBe('ISSUED');
    expect(prisma.certificate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'TRAINING',
          activityKind: 'TRAINING',
          activityId: 3,
          dedupKey: '1:TRAINING:3:1',
        }),
      }),
    );
  });

  it('TRAINING por concluir → NOT_ELIGIBLE (COMPLETION_INCOMPLETE)', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    prisma.training.findUnique.mockResolvedValue({ issueCertificate: true });
    facts.collect.mockResolvedValue(goodFacts({ completionPct: 0 }));
    const r = await svc.issue({ ...input, activityKind: 'TRAINING', activityId: 3 });
    expect(r).toEqual({ outcome: 'NOT_ELIGIBLE', missing: ['COMPLETION_INCOMPLETE'] });
  });

  it('TRAINING já com certificado (mesma dedupKey) → EXISTS, sem duplicar', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    prisma.training.findUnique.mockResolvedValue({ issueCertificate: true });
    prisma.certificate.findFirst.mockResolvedValue({ id: 9 });
    const r = await svc.issue({ ...input, activityKind: 'TRAINING', activityId: 3 });
    expect(r.outcome).toBe('EXISTS');
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('TRAINING com certificado do atalho antigo (CERT-...-user-sessão) → EXISTS', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    prisma.training.findUnique.mockResolvedValue({ issueCertificate: true });
    prisma.trainingSession.findMany.mockResolvedValue([{ id: 41 }, { id: 42 }]);
    prisma.certificate.findFirst.mockResolvedValue({ id: 3, validationCode: 'CERT-1-1-42' });

    const r = await svc.issue({ ...input, activityKind: 'TRAINING', activityId: 3 });

    expect(r.outcome).toBe('EXISTS');
    expect(prisma.certificate.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            userId: 1,
            activityKind: null,
            OR: [
              { validationCode: { endsWith: '-1-41' } },
              { validationCode: { endsWith: '-1-42' } },
            ],
          }),
        ]),
      }),
    });
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('LEARNING_PATH sem regra → regra implícita de conclusão total', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    facts.collect.mockResolvedValue(goodFacts({ bestScore: null }));
    const r = await svc.issue({ ...input, activityKind: 'LEARNING_PATH', activityId: 5 });
    expect(r.outcome).toBe('ISSUED');
    expect(prisma.certificate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activityKind: 'LEARNING_PATH',
          dedupKey: '1:LEARNING_PATH:5:1',
        }),
      }),
    );
  });

  it('LEARNING_PATH incompleta → NOT_ELIGIBLE', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(null);
    facts.collect.mockResolvedValue(goodFacts({ completionPct: 67 }));
    const r = await svc.issue({ ...input, activityKind: 'LEARNING_PATH', activityId: 5 });
    expect(r.outcome).toBe('NOT_ELIGIBLE');
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

  it('emissão envia o e-mail só com a ligação de verificação', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule());
    prisma.certificate.findUnique.mockResolvedValue({
      validationCode: 'ABCD1234EFGH5678',
      user: { email: 'ana@x.com', fullName: 'Ana Silva' },
    });
    await svc.issue(input);
    expect(mail.sendCertificateLink).toHaveBeenCalledWith(
      'ana@x.com',
      'Ana Silva',
      'Segurança',
      expect.stringContaining('/verify/ABCD1234EFGH5678'),
    );
  });

  it('falha de SMTP na emissão não falha a emissão', async () => {
    prisma.certificateRule.findUnique.mockResolvedValue(rule());
    prisma.certificate.findUnique.mockResolvedValue({
      validationCode: 'ABCD1234EFGH5678',
      user: { email: 'ana@x.com', fullName: 'Ana Silva' },
    });
    mail.sendCertificateLink.mockRejectedValue(new Error('smtp'));
    expect((await svc.issue(input)).outcome).toBe('ISSUED');
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

  describe('template no snapshot', () => {
    it('sem templateId na regra usa o clássico e grava a versão no snapshot e no certificado', async () => {
      prisma.certificateRule.findUnique.mockResolvedValue(rule());
      await svc.issue(input);
      expect(templates.resolveForIssuance).toHaveBeenCalledWith(undefined);
      const data = prisma.certificate.create.mock.calls[0][0].data;
      const snap = JSON.parse(data.snapshot);
      expect(snap.template).toMatchObject({ id: 'tpl-1-corporativo-classico', version: 1 });
      expect(snap.template.config.layoutKey).toBe('corporativo-classico');
      expect(data.templateId).toBe('tpl-1-corporativo-classico');
    });

    it('com templateId na regra usa esse modelo e a sua versão actual', async () => {
      prisma.certificateRule.findUnique.mockResolvedValue(
        rule({ templateId: 'tpl-3-executivo-premium' }),
      );
      templates.resolveForIssuance.mockResolvedValue(tpl('tpl-3-executivo-premium', 4));
      await svc.issue(input);
      expect(templates.resolveForIssuance).toHaveBeenCalledWith('tpl-3-executivo-premium');
      const snap = JSON.parse(prisma.certificate.create.mock.calls[0][0].data.snapshot);
      expect(snap.template).toMatchObject({ id: 'tpl-3-executivo-premium', version: 4 });
      expect(snap.template.config.layoutKey).toBe('executivo-premium');
    });

    it('modelo da regra desaparecido: emite na mesma com o clássico (nunca falha a emissão)', async () => {
      prisma.certificateRule.findUnique.mockResolvedValue(rule({ templateId: 'tpl-removido' }));
      templates.resolveForIssuance
        .mockRejectedValueOnce(new Error('404'))
        .mockResolvedValueOnce(tpl());
      const r = await svc.issue(input);
      expect(r.outcome).toBe('ISSUED');
      expect(JSON.parse(prisma.certificate.create.mock.calls[0][0].data.snapshot).template.id).toBe(
        'tpl-1-corporativo-classico',
      );
    });

    it('até o modelo por omissão indisponível não impede a emissão (usa o de origem em memória)', async () => {
      prisma.certificateRule.findUnique.mockResolvedValue(rule());
      templates.resolveForIssuance.mockRejectedValue(new Error('BD indisponível'));
      const r = await svc.issue(input);
      expect(r.outcome).toBe('ISSUED');
      expect(
        JSON.parse(prisma.certificate.create.mock.calls[0][0].data.snapshot).template,
      ).toMatchObject({
        id: 'tpl-1-corporativo-classico',
        version: 1,
      });
    });
  });
});
