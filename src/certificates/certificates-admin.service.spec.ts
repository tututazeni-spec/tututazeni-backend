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

  describe('exportRows', () => {
    it('sem paginação: pede no máximo N linhas, na ordem pedida, dentro do âmbito', async () => {
      await svc.exportRows(
        { sort: 'holderName', order: 'asc' },
        { kind: 'TEAM', userIds: [1] },
        now,
        5001,
      );
      const arg = prisma.certificate.findMany.mock.calls[0][0];
      expect(arg.take).toBe(5001);
      expect(arg.skip).toBeUndefined();
      expect(arg.orderBy).toEqual({ user: { fullName: 'asc' } });
      expect(arg.where.AND).toContainEqual({ userId: { in: [1] } });
    });

    it('código inválido devolve vazio sem consultar', async () => {
      expect(await svc.exportRows({ code: "1' OR" }, { kind: 'ALL' }, now, 10)).toEqual([]);
      expect(prisma.certificate.findMany).not.toHaveBeenCalled();
    });
  });

  describe('âmbito de equipa', () => {
    it('list TEAM filtra pelos ids da equipa', async () => {
      await svc.list({}, now, { kind: 'TEAM', userIds: [1, 2] });
      expect(prisma.certificate.findMany.mock.calls[0][0].where.AND).toContainEqual({
        userId: { in: [1, 2] },
      });
    });

    it('list TEAM com equipa vazia filtra por lista vazia (nunca por tudo)', async () => {
      await svc.list({}, now, { kind: 'TEAM', userIds: [] });
      expect(prisma.certificate.findMany.mock.calls[0][0].where.AND).toContainEqual({
        userId: { in: [] },
      });
    });

    it('list ALL não acrescenta filtro de titular', async () => {
      await svc.list({}, now, { kind: 'ALL' });
      expect(JSON.stringify(prisma.certificate.findMany.mock.calls[0][0].where)).not.toContain(
        '"userId":{"in"',
      );
    });

    it('overview TEAM restringe todas as contagens à equipa', async () => {
      await svc.overview(now, { kind: 'TEAM', userIds: [3] });
      for (const [arg] of prisma.certificate.count.mock.calls) {
        expect(JSON.stringify(arg.where)).toContain('"userId":{"in":[3]}');
      }
      expect(JSON.stringify(prisma.enrollment.count.mock.calls[0][0].where)).toContain(
        '"userId":{"in":[3]}',
      );
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

describe('CertificatesAdminService.history', () => {
  const prisma = { auditLog: { count: jest.fn(), findMany: jest.fn() } };
  const svc = new CertificatesAdminService(prisma as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.auditLog.count.mockResolvedValue(1);
  });

  it('filtra pela entidade Certificate e pelo id do certificado', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    await svc.history({ certificateId: 7 });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({
      entity: 'Certificate',
      entityId: 7,
    });
  });

  it('sem certificateId inclui também alterações a regras', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    await svc.history({});
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({
      entity: { in: ['Certificate', 'CertificateRule'] },
    });
  });

  it('metadata inválido devolve null em vez de rebentar', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 1,
        action: 'CERTIFICATE_ISSUED',
        entity: 'Certificate',
        entityId: 7,
        timestamp: new Date(),
        reason: null,
        metadata: '{não é json',
        user: { fullName: 'RH Teste' },
      },
    ]);
    const r = await svc.history({});
    expect(r.data[0]).toMatchObject({ certificateId: 7, userName: 'RH Teste', metadata: null });
  });
});
