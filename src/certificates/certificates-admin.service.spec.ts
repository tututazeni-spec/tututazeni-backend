import { CertificatesAdminService } from './certificates-admin.service';

describe('CertificatesAdminService', () => {
  const prisma = {
    certificate: { count: jest.fn(), findMany: jest.fn() },
    enrollment: { count: jest.fn() },
  };
  const svc = new CertificatesAdminService(prisma as never);
  const now = new Date('2026-10-19T12:00:00Z');

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificate.findMany.mockResolvedValue([]);
    prisma.certificate.count.mockResolvedValue(0);
    prisma.enrollment.count.mockResolvedValue(0);
  });

  describe('overview', () => {
    it('mapeia as contagens pela ordem total/ativos/pendentes/expirados/a vencer/revogados', async () => {
      prisma.certificate.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      const r = await svc.overview(now);
      expect(r).toMatchObject({
        total: 5,
        active: 2,
        pendingApproval: 1,
        expired: 1,
        expiringSoon: 1,
        revoked: 1,
      });
    });

    it('"ativo" exclui certificados expirados e revogados mesmo com status gravado ACTIVE', async () => {
      await svc.overview(now);
      const activeWhere = prisma.certificate.count.mock.calls[1][0].where;
      expect(activeWhere).toMatchObject({ revoked: false, status: 'ACTIVE' });
      expect(JSON.stringify(activeWhere)).toContain('"expiresAt":null');
      expect(JSON.stringify(activeWhere)).toContain(`"gt":"${now.toISOString()}"`);
    });

    it('"a vencer" usa a janela de 30 dias', async () => {
      await svc.overview(now);
      const soon = prisma.certificate.count.mock.calls[4][0].where.expiresAt;
      expect(soon.gt).toEqual(now);
      expect(soon.lte).toEqual(new Date(now.getTime() + 30 * 86_400_000));
    });

    it('cobertura obrigatória é null sem matrículas obrigatórias', async () => {
      expect((await svc.overview(now)).mandatoryCoveragePct).toBeNull();
    });

    it('cobertura obrigatória 50% com 1 de 2 certificadas', async () => {
      prisma.enrollment.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
      expect((await svc.overview(now)).mandatoryCoveragePct).toBe(50);
    });
  });

  describe('list', () => {
    const row = (over = {}) => ({
      id: 1,
      recipientName: null,
      title: null,
      status: 'ACTIVE',
      revoked: false,
      expiresAt: null,
      issuedAt: new Date('2026-10-01'),
      validationCode: 'ABCD1234EFGH5678',
      activityKind: 'COURSE',
      hours: 8,
      user: { fullName: 'Ana Silva', department: { name: 'RH' } },
      course: { title: 'Segurança' },
      event: null,
      ...over,
    });

    it('estado EXPIRED filtra expiresAt ≤ agora e revoked false', async () => {
      await svc.list({ status: 'EXPIRED' }, now);
      const where = prisma.certificate.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual(
        expect.objectContaining({ deletedAt: null, revoked: false, expiresAt: { lte: now } }),
      );
    });

    it('paginação: page 2 limit 100 → skip 100 take 100', async () => {
      await svc.list({ page: 2, limit: 100 }, now);
      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 100 }),
      );
    });

    it('pesquisa com % e _ é passada como texto literal em contains', async () => {
      await svc.list({ search: '%_' }, now);
      expect(JSON.stringify(prisma.certificate.findMany.mock.calls[0][0].where)).toContain(
        '"contains":"%_"',
      );
    });

    it('código é normalizado antes de consultar', async () => {
      await svc.list({ code: 'abcd-1234' }, now);
      expect(JSON.stringify(prisma.certificate.findMany.mock.calls[0][0].where)).toContain(
        'ABCD1234',
      );
    });

    it('código inválido devolve lista vazia sem consultar a BD', async () => {
      const r = await svc.list({ code: "1' OR" }, now);
      expect(r).toMatchObject({ data: [], total: 0 });
      expect(prisma.certificate.findMany).not.toHaveBeenCalled();
    });

    it('linha usa nome do utilizador, título do curso e estado efectivo', async () => {
      prisma.certificate.count.mockResolvedValue(1);
      prisma.certificate.findMany.mockResolvedValue([row({ expiresAt: new Date('2026-01-01') })]);
      const r = await svc.list({}, now);
      expect(r.data[0]).toMatchObject({
        holderName: 'Ana Silva',
        departmentName: 'RH',
        title: 'Segurança',
        status: 'EXPIRED',
        code: 'ABCD1234EFGH5678',
      });
      expect(r).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });
  });
});
