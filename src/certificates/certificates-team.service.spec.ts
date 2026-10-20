import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CertificatesTeamService } from './certificates-team.service';

const DAY = 86_400_000;

describe('CertificatesTeamService', () => {
  const prisma = {
    user: { findMany: jest.fn() },
    certificate: { findMany: jest.fn(), findUnique: jest.fn() },
    enrollment: { findMany: jest.fn() },
  };
  const scope = { resolveScope: jest.fn() };
  const svc = new CertificatesTeamService(prisma as never, scope as never);
  const manager = { id: 7, role: { name: 'GESTOR' } };
  const rh = { id: 1, role: { name: 'RH' } };
  const now = new Date('2026-10-20T10:00:00Z');

  const cert = (userId: number, over: Record<string, unknown> = {}) => ({
    userId,
    status: 'ACTIVE',
    revoked: false,
    expiresAt: null,
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    scope.resolveScope.mockResolvedValue({ kind: 'TEAM', userIds: [1, 2] });
    prisma.user.findMany.mockResolvedValue([
      { id: 1, fullName: 'Ana' },
      { id: 2, fullName: 'Bruno' },
    ]);
    prisma.certificate.findMany.mockResolvedValue([]);
    prisma.enrollment.findMany.mockResolvedValue([]);
  });

  describe('teamSummary', () => {
    it('conta por colaborador e no total, pelo estado efectivo', async () => {
      prisma.certificate.findMany.mockResolvedValue([
        cert(1, { expiresAt: new Date(now.getTime() + 10 * DAY) }),
        cert(2, { expiresAt: new Date(now.getTime() - DAY) }),
        cert(2, { status: 'PENDING_APPROVAL' }),
      ]);
      prisma.enrollment.findMany.mockResolvedValue([
        { userId: 2, status: 'IN_PROGRESS', mandatory: true, certificates: [] },
        { userId: 1, status: 'IN_PROGRESS', mandatory: false, certificates: [] },
      ]);
      const r = await svc.teamSummary(manager, undefined, now);
      const ana = r.members.find(m => m.userId === 1)!;
      const bruno = r.members.find(m => m.userId === 2)!;
      expect(ana).toMatchObject({
        active: 1,
        expiringSoon: 1,
        expired: 0,
        inProgress: 1,
        mandatoryPending: 0,
      });
      expect(bruno).toMatchObject({
        active: 0,
        expired: 1,
        pendingApproval: 1,
        inProgress: 1,
        mandatoryPending: 1,
      });
      expect(r.totals).toMatchObject({
        members: 2,
        active: 1,
        expired: 1,
        pendingApproval: 1,
        expiringSoon: 1,
      });
    });

    it('obrigatória cancelada ou expirada não conta como em falta', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        { userId: 1, status: 'CANCELLED', mandatory: true, certificates: [] },
        { userId: 1, status: 'EXPIRED', mandatory: true, certificates: [] },
      ]);
      expect((await svc.teamSummary(manager, undefined, now)).totals.mandatoryPending).toBe(0);
    });

    it('cobertura: 1 de 2 obrigatórias concluídas com certificado válido = 50%', async () => {
      prisma.enrollment.findMany.mockResolvedValue([
        {
          userId: 1,
          status: 'COMPLETED',
          mandatory: true,
          certificates: [{ status: 'ACTIVE', revoked: false, expiresAt: null }],
        },
        { userId: 2, status: 'IN_PROGRESS', mandatory: true, certificates: [] },
      ]);
      expect((await svc.teamSummary(manager, undefined, now)).totals.mandatoryCoveragePct).toBe(50);
    });

    it('cobertura é null sem obrigatórias', async () => {
      expect(
        (await svc.teamSummary(manager, undefined, now)).totals.mandatoryCoveragePct,
      ).toBeNull();
    });

    it('equipa vazia devolve zeros sem consultar certificados', async () => {
      scope.resolveScope.mockResolvedValue({ kind: 'TEAM', userIds: [] });
      prisma.user.findMany.mockResolvedValue([]);
      const r = await svc.teamSummary(manager, undefined, now);
      expect(r.members).toEqual([]);
      expect(r.totals.members).toBe(0);
      expect(prisma.certificate.findMany).not.toHaveBeenCalled();
    });

    it('âmbito total sem departamento → 400 (não despeja a empresa inteira)', async () => {
      scope.resolveScope.mockResolvedValue({ kind: 'ALL' });
      await expect(svc.teamSummary(rh, undefined, now)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('âmbito total com departamento pesquisa os membros activos desse departamento', async () => {
      scope.resolveScope.mockResolvedValue({ kind: 'ALL' });
      await svc.teamSummary(rh, 4, now);
      expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
        departmentId: 4,
        active: true,
      });
    });

    it('gestor ignora o departmentId pedido (só a equipa)', async () => {
      await svc.teamSummary(manager, 99, now);
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ id: { in: [1, 2] } });
      expect(where).not.toHaveProperty('departmentId');
    });
  });

  describe('assertCanApprove', () => {
    it('ADMIN/RH aprovam qualquer um sem consultar o certificado', async () => {
      scope.resolveScope.mockResolvedValue({ kind: 'ALL' });
      await expect(svc.assertCanApprove(rh, 5)).resolves.toBeUndefined();
      expect(prisma.certificate.findUnique).not.toHaveBeenCalled();
    });

    it('gestor aprova o de um subordinado', async () => {
      prisma.certificate.findUnique.mockResolvedValue({ userId: 2 });
      await expect(svc.assertCanApprove(manager, 5)).resolves.toBeUndefined();
    });

    it('gestor aprovar o de fora da equipa → 404', async () => {
      prisma.certificate.findUnique.mockResolvedValue({ userId: 99 });
      await expect(svc.assertCanApprove(manager, 5)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('certificado inexistente → 404', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);
      await expect(svc.assertCanApprove(manager, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
