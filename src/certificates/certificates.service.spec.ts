import { ConflictException, NotFoundException } from '@nestjs/common';
import { CertificatesService, effectiveStatus } from './certificates.service';
import { BUILTIN_TEMPLATES } from './templates/builtin-templates';

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
  const assets = { loadForRender: jest.fn() };
  const svc = new CertificatesService(prisma as never, assets as never);

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
    origin: 'INTERNAL',
    fileUrl: null,
    snapshot: null,
    score: 80,
    course: { title: 'Curso X' },
    event: null,
    user: { fullName: 'Ana Silva' },
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    assets.loadForRender.mockResolvedValue({});
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
          'origin',
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

  describe('getPublicPdf', () => {
    it('código válido e certificado activo → PDF', async () => {
      prisma.certificate.findFirst.mockResolvedValue(row());
      const buf = await svc.getPublicPdf('abcd-1234-efgh-5678');
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('revogado → 404 genérico', async () => {
      prisma.certificate.findFirst.mockResolvedValue(row({ revoked: true, status: 'REVOKED' }));
      await expect(svc.getPublicPdf('ABCD1234EFGH5678')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('inexistente ou inválido → 404 genérico', async () => {
      prisma.certificate.findFirst.mockResolvedValue(null);
      await expect(svc.getPublicPdf('ABCD1234EFGH5678')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.getPublicPdf('!!')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('certificados externos', () => {
    const PDF_BYTES = Buffer.from('%PDF-1.4 externo');
    const external = (over = {}) =>
      row({
        origin: 'EXTERNAL',
        issuerName: 'Cruz Vermelha',
        fileUrl: `data:application/pdf;base64,${PDF_BYTES.toString('base64')}`,
        ...over,
      });

    it('verificação pública identifica a origem externa e a entidade emissora', async () => {
      prisma.certificate.findFirst.mockResolvedValue(external());
      expect(await svc.verifyPublic('ABCD1234EFGH5678')).toMatchObject({
        origin: 'EXTERNAL',
        issuerName: 'Cruz Vermelha',
      });
    });

    it('o download devolve exactamente o PDF carregado, sem gerar outro', async () => {
      prisma.certificate.findUnique.mockResolvedValue(external());
      const buf = await svc.getPdfFor(5, { id: 1, role: { name: 'COLABORADOR' } });
      expect(buf.equals(PDF_BYTES)).toBe(true);
    });

    it('externo sem PDF carregado → 409', async () => {
      prisma.certificate.findUnique.mockResolvedValue(external({ fileUrl: 'https://x.com/a.pdf' }));
      await expect(
        svc.getPdfFor(5, { id: 1, role: { name: 'COLABORADOR' } }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('a lista do colaborador nunca devolve o documento nem o snapshot', async () => {
      prisma.certificate.findMany.mockResolvedValue([external({ snapshot: '{}' })]);
      const [r] = await svc.listMine(1);
      expect(r).not.toHaveProperty('fileUrl');
      expect(r).not.toHaveProperty('snapshot');
      expect(r).toMatchObject({ origin: 'EXTERNAL' });
    });
  });

  describe('partilha na lista do colaborador', () => {
    it('cada linha traz a ligação de verificação; só o válido traz o LinkedIn', async () => {
      prisma.certificate.findMany.mockResolvedValue([
        row({ id: 1, validationCode: 'AAAA1111BBBB2222' }),
        row({ id: 2, validationCode: 'CCCC3333DDDD4444', revoked: true, status: 'REVOKED' }),
        row({
          id: 3,
          validationCode: 'EEEE5555FFFF6666',
          expiresAt: new Date(Date.now() - 86_400_000),
        }),
      ]);
      const [ok, revoked, expired] = await svc.listMine(1);
      expect(ok.verifyUrl).toMatch(/\/verify\/AAAA1111BBBB2222$/);
      expect(ok.linkedInUrl).toContain('startTask=CERTIFICATION_NAME');
      expect(revoked.verifyUrl).toMatch(/\/verify\/CCCC3333DDDD4444$/);
      expect(revoked.linkedInUrl).toBeUndefined();
      expect(expired.linkedInUrl).toBeUndefined();
    });
  });

  describe('PDF com o template do snapshot', () => {
    const owner = { id: 1, role: { name: 'COLABORADOR' } };

    it('carrega as imagens referidas pelo snapshot (nunca pelo template actual)', async () => {
      const config = {
        ...BUILTIN_TEMPLATES[0].config,
        assets: { logoId: 'logo-id-0001', signatureId: 'sign-id-0001' },
      };
      prisma.certificate.findUnique.mockResolvedValue(
        row({
          snapshot: JSON.stringify({
            code: 'ABCD1234EFGH5678',
            recipientName: 'Ana',
            title: 'Segurança',
            issuedAt: '2026-10-01T00:00:00.000Z',
            issuerName: 'INNOVA',
            template: { id: BUILTIN_TEMPLATES[0].id, version: 1, config },
          }),
        }),
      );
      const buf = await svc.getPdfFor(5, owner);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(assets.loadForRender).toHaveBeenCalledWith({
        logoId: 'logo-id-0001',
        signatureId: 'sign-id-0001',
      });
    });

    it('certificado antigo sem template: sem imagens e PDF clássico', async () => {
      prisma.certificate.findUnique.mockResolvedValue(row());
      const buf = await svc.getPdfFor(5, owner);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(assets.loadForRender).toHaveBeenCalledWith({});
    });

    it('sem serviço de imagens injectado continua a gerar o PDF', async () => {
      const bare = new CertificatesService(prisma as never);
      prisma.certificate.findUnique.mockResolvedValue(row());
      expect((await bare.getPdfFor(5, owner)).subarray(0, 5).toString()).toBe('%PDF-');
    });
  });
});
