import { ConflictException, NotFoundException } from '@nestjs/common';
import { CertificatesService, effectiveStatus } from './certificates.service';

const DAY = 86_400_000;

describe('effectiveStatus', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  it('revogado vence expirado', () => {
    expect(
      effectiveStatus(
        { status: 'ACTIVE', revoked: true, expiresAt: new Date(now.getTime() - DAY) },
        now,
      ),
    ).toBe('REVOKED');
  });
  it('ativo com validade passada → EXPIRED', () => {
    expect(
      effectiveStatus(
        { status: 'ACTIVE', revoked: false, expiresAt: new Date(now.getTime() - DAY) },
        now,
      ),
    ).toBe('EXPIRED');
  });
  it('ativo sem validade → ACTIVE', () => {
    expect(effectiveStatus({ status: 'ACTIVE', revoked: false, expiresAt: null }, now)).toBe(
      'ACTIVE',
    );
  });
  it('pendente mantém-se pendente', () => {
    expect(
      effectiveStatus({ status: 'PENDING_APPROVAL', revoked: false, expiresAt: null }, now),
    ).toBe('PENDING_APPROVAL');
  });
});

describe('CertificatesService', () => {
  const prisma = {
    certificate: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const svc = new CertificatesService(prisma as never);

  const row = (over = {}) => ({
    id: 5,
    userId: 1,
    status: 'ACTIVE',
    revoked: false,
    expiresAt: null,
    issuedAt: new Date('2026-10-01T00:00:00Z'),
    validationCode: 'ABCD1234EFGH5678',
    recipientName: 'Ana Silva',
    title: 'Segurança',
    hours: 8,
    issuerName: 'INNOVA',
    activityKind: 'COURSE',
    snapshot: null,
    score: 80,
    course: { title: 'Curso X' },
    event: null,
    user: { fullName: 'Ana Silva' },
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificate.update.mockResolvedValue({});
  });

  describe('verifyPublic', () => {
    it('devolve apenas campos públicos', async () => {
      prisma.certificate.findFirst.mockResolvedValue(row());
      const r = await svc.verifyPublic('abcd-1234 efgh5678');
      expect(Object.keys(r).sort()).toEqual(
        [
          'expiresAt',
          'holderName',
          'hours',
          'issuedAt',
          'issuerName',
          'status',
          'title',
          'type',
          'valid',
        ].sort(),
      );
      expect(r).toMatchObject({ valid: true, status: 'ACTIVE', holderName: 'Ana Silva' });
    });

    it('revogado → valid false, status REVOKED', async () => {
      prisma.certificate.findFirst.mockResolvedValue(row({ revoked: true, status: 'REVOKED' }));
      expect(await svc.verifyPublic('ABCD1234EFGH5678')).toMatchObject({
        valid: false,
        status: 'REVOKED',
      });
    });

    it('expirado → valid false, status EXPIRED', async () => {
      prisma.certificate.findFirst.mockResolvedValue(
        row({ expiresAt: new Date(Date.now() - DAY) }),
      );
      expect(await svc.verifyPublic('ABCD1234EFGH5678')).toMatchObject({
        valid: false,
        status: 'EXPIRED',
      });
    });

    it('pendente de aprovação → 404 genérico', async () => {
      prisma.certificate.findFirst.mockResolvedValue(row({ status: 'PENDING_APPROVAL' }));
      await expect(svc.verifyPublic('ABCD1234EFGH5678')).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([["1' OR 1=1"], ['x'.repeat(65)], ['']])(
      'código inválido %p → 404 sem consultar a BD',
      async raw => {
        await expect(svc.verifyPublic(raw)).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.certificate.findFirst).not.toHaveBeenCalled();
      },
    );

    it('aceita códigos legados com hífens (CERT-1-2-3)', async () => {
      prisma.certificate.findFirst.mockResolvedValue(row({ validationCode: 'CERT-1-2-3' }));
      await svc.verifyPublic('CERT-1-2-3');
      const where = prisma.certificate.findFirst.mock.calls[0][0].where;
      expect(JSON.stringify(where)).toContain('CERT-1-2-3');
    });
  });

  describe('getPdfFor', () => {
    const owner = { id: 1, role: { name: 'COLABORADOR' } };
    it('outro colaborador não acede (404, sem revelar existência)', async () => {
      prisma.certificate.findUnique.mockResolvedValue(row());
      await expect(
        svc.getPdfFor(5, { id: 2, role: { name: 'COLABORADOR' } }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revogado → 409', async () => {
      prisma.certificate.findUnique.mockResolvedValue(row({ revoked: true, status: 'REVOKED' }));
      await expect(svc.getPdfFor(5, owner)).rejects.toBeInstanceOf(ConflictException);
    });

    it('dono recebe PDF e incrementa downloadCount', async () => {
      prisma.certificate.findUnique.mockResolvedValue(row());
      const buf = await svc.getPdfFor(5, owner);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(prisma.certificate.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { downloadCount: { increment: 1 } } }),
      );
    });

    it('RH recebe PDF de certificado alheio', async () => {
      prisma.certificate.findUnique.mockResolvedValue(row());
      const buf = await svc.getPdfFor(5, { id: 9, role: { name: 'RH' } });
      expect(buf.length).toBeGreaterThan(1000);
    });
  });
});
