import { ConflictException, NotFoundException } from '@nestjs/common';
import { buildLinkedInUrl, CertificatesMeService } from './certificates-me.service';

const DAY = 86_400_000;

describe('buildLinkedInUrl', () => {
  const base = {
    title: 'Segurança & Saúde',
    issuerName: 'INNOVA',
    issuedAt: new Date('2026-03-15T00:00:00Z'),
    expiresAt: new Date('2028-03-15T00:00:00Z'),
    validationCode: 'ABCD1234EFGH5678',
  };

  it('usa o fluxo oficial "Add to profile" com os dados codificados', () => {
    const url = new URL(buildLinkedInUrl(base));
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/profile/add');
    expect(url.searchParams.get('startTask')).toBe('CERTIFICATION_NAME');
    expect(url.searchParams.get('name')).toBe('Segurança & Saúde');
    expect(url.searchParams.get('organizationName')).toBe('INNOVA');
    expect(url.searchParams.get('issueYear')).toBe('2026');
    expect(url.searchParams.get('issueMonth')).toBe('3');
    expect(url.searchParams.get('expirationYear')).toBe('2028');
    expect(url.searchParams.get('expirationMonth')).toBe('3');
    expect(url.searchParams.get('certId')).toBe('ABCD1234EFGH5678');
    expect(url.searchParams.get('certUrl')).toMatch(/\/verify\/ABCD1234EFGH5678$/);
  });

  it('o & do título vem codificado (não parte os parâmetros)', () => {
    expect(buildLinkedInUrl(base)).toContain('Seguran%C3%A7a+%26+Sa%C3%BAde');
  });

  it('sem validade omite os parâmetros de expiração', () => {
    const url = new URL(buildLinkedInUrl({ ...base, expiresAt: null }));
    expect(url.searchParams.has('expirationYear')).toBe(false);
    expect(url.searchParams.has('expirationMonth')).toBe(false);
  });

  it('sem entidade emissora usa INNOVA', () => {
    const url = new URL(buildLinkedInUrl({ ...base, issuerName: null }));
    expect(url.searchParams.get('organizationName')).toBe('INNOVA');
  });
});

describe('CertificatesMeService', () => {
  const prisma = {
    certificate: { findMany: jest.fn(), findUnique: jest.fn() },
    enrollment: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const mail = { isConfigured: jest.fn(), sendNotification: jest.fn() };
  const audit = { log: jest.fn() };
  const svc = new CertificatesMeService(prisma as never, mail as never, audit as never);
  const now = new Date('2026-10-20T10:00:00Z');

  beforeEach(() => {
    jest.resetAllMocks();
    mail.isConfigured.mockResolvedValue(true);
    mail.sendNotification.mockResolvedValue(undefined);
    prisma.certificate.findMany.mockResolvedValue([]);
    prisma.enrollment.findMany.mockResolvedValue([]);
  });

  describe('mySummary', () => {
    const cert = (id: number, over: Record<string, unknown> = {}) => ({
      id,
      title: `Cert ${id}`,
      status: 'ACTIVE',
      revoked: false,
      expiresAt: null,
      course: null,
      event: null,
      ...over,
    });

    it('separa pendentes e a expirar em breve, só do próprio titular', async () => {
      prisma.certificate.findMany.mockResolvedValue([
        cert(1, { status: 'PENDING_APPROVAL' }),
        cert(2, { expiresAt: new Date(now.getTime() + 10 * DAY) }),
        cert(3, { expiresAt: new Date(now.getTime() + 90 * DAY) }),
        cert(4, { expiresAt: new Date(now.getTime() - DAY) }),
        cert(5, { revoked: true, status: 'REVOKED' }),
      ]);
      const r = await svc.mySummary(42, now);
      expect(prisma.certificate.findMany.mock.calls[0][0].where).toMatchObject({ userId: 42 });
      expect(r.pending.map(p => p.id)).toEqual([1]);
      expect(r.expiringSoon.map(p => p.id)).toEqual([2]);
    });

    it('obrigatórias em falta: só as por concluir (não COMPLETED/CANCELLED/EXPIRED)', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: 1,
          courseId: 10,
          status: 'IN_PROGRESS',
          deadline: null,
          course: { title: 'Segurança' },
        },
      ]);
      const r = await svc.mySummary(42, now);
      const where = prisma.enrollment.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ userId: 42, mandatory: true });
      expect(where.status).toEqual({ notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] });
      expect(r.mandatoryMissing).toEqual([
        {
          enrollmentId: 1,
          courseId: 10,
          title: 'Segurança',
          deadline: null,
          status: 'IN_PROGRESS',
        },
      ]);
    });

    it('emailEnabled reflecte a configuração de SMTP', async () => {
      mail.isConfigured.mockResolvedValue(false);
      expect((await svc.mySummary(42, now)).emailEnabled).toBe(false);
      mail.isConfigured.mockResolvedValue(true);
      expect((await svc.mySummary(42, now)).emailEnabled).toBe(true);
    });
  });

  describe('emailMe', () => {
    const own = (over: Record<string, unknown> = {}) => ({
      id: 5,
      userId: 42,
      status: 'ACTIVE',
      revoked: false,
      expiresAt: null,
      title: 'Segurança',
      validationCode: 'ABCD1234EFGH5678',
      ...over,
    });

    it('certificado de outro titular → 404 e nada é enviado', async () => {
      prisma.certificate.findUnique.mockResolvedValue(own({ userId: 99 }));
      await expect(svc.emailMe(5, { id: 42 })).rejects.toBeInstanceOf(NotFoundException);
      expect(mail.sendNotification).not.toHaveBeenCalled();
    });

    it('certificado inexistente → 404', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);
      await expect(svc.emailMe(5, { id: 42 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revogado → 409', async () => {
      prisma.certificate.findUnique.mockResolvedValue(own({ revoked: true, status: 'REVOKED' }));
      await expect(svc.emailMe(5, { id: 42 })).rejects.toBeInstanceOf(ConflictException);
    });

    it('SMTP não configurado → 409 claro e nada é enviado', async () => {
      prisma.certificate.findUnique.mockResolvedValue(own());
      mail.isConfigured.mockResolvedValue(false);
      await expect(svc.emailMe(5, { id: 42 })).rejects.toThrow(/e-mail não está configurado/i);
      expect(mail.sendNotification).not.toHaveBeenCalled();
    });

    it('envia sempre para o e-mail do próprio titular, lido da BD, com a ligação de verificação', async () => {
      prisma.certificate.findUnique.mockResolvedValue(own());
      prisma.user.findUnique.mockResolvedValue({ email: 'ana@innova.com' });
      expect(await svc.emailMe(5, { id: 42 })).toEqual({ emailed: true });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 42 } }),
      );
      expect(mail.sendNotification).toHaveBeenCalledWith(
        'ana@innova.com',
        expect.stringContaining('Segurança'),
        expect.stringContaining('/verify/ABCD1234EFGH5678'),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICATE_EMAILED_TO_SELF', userId: 42, entityId: 5 }),
      );
    });

    it('falha de SMTP no envio → erro (não diz que enviou)', async () => {
      prisma.certificate.findUnique.mockResolvedValue(own());
      prisma.user.findUnique.mockResolvedValue({ email: 'ana@innova.com' });
      mail.sendNotification.mockRejectedValue(new Error('smtp'));
      await expect(svc.emailMe(5, { id: 42 })).rejects.toThrow();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
