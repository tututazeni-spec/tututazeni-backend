import { ForbiddenException } from '@nestjs/common';
import { CertificateScopeService } from './certificate-scope.service';

describe('CertificateScopeService', () => {
  const prisma = { user: { findMany: jest.fn() } };
  const svc = new CertificateScopeService(prisma as never);
  const actor = (name: string, id = 7) => ({ id, role: { name } });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findMany.mockResolvedValue([]);
  });

  it.each(['ADMIN', 'RH', 'AUDITOR'])('%s vê tudo', async role => {
    expect(await svc.resolveScope(actor(role))).toEqual({ kind: 'ALL' });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it.each(['GESTOR', 'LIDER', 'DIRECTOR'])('%s vê só a equipa directa', async role => {
    prisma.user.findMany.mockResolvedValue([{ id: 11 }, { id: 12 }]);
    expect(await svc.resolveScope(actor(role))).toEqual({ kind: 'TEAM', userIds: [11, 12] });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { managerId: 7 } }),
    );
  });

  it('gestor sem subordinados → equipa vazia (nunca a empresa inteira)', async () => {
    expect(await svc.resolveScope(actor('GESTOR'))).toEqual({ kind: 'TEAM', userIds: [] });
  });

  it.each(['COLABORADOR', 'INSTRUCTOR'])('%s não tem acesso', async role => {
    await expect(svc.resolveScope(actor(role))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('utilizador sem papel → Forbidden', async () => {
    await expect(svc.resolveScope({ id: 1, role: null })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
