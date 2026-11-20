import { BadRequestException } from '@nestjs/common';
import { assertAdminEvaluatedByOtherAdmin } from './evaluation-admin-rule';

function prismaWith(users: { id: number; role: { name: string } }[]) {
  return { read: { user: { findMany: jest.fn().mockResolvedValue(users) } } } as never;
}

describe('assertAdminEvaluatedByOtherAdmin', () => {
  it('bloqueia um admin a avaliar-se a si próprio', async () => {
    const prisma = prismaWith([{ id: 1, role: { name: 'ADMIN' } }]);
    await expect(assertAdminEvaluatedByOtherAdmin(prisma, 1, 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('bloqueia avaliador não-admin sobre um admin', async () => {
    const prisma = prismaWith([
      { id: 1, role: { name: 'ADMIN' } },
      { id: 2, role: { name: 'GESTOR' } },
    ]);
    await expect(assertAdminEvaluatedByOtherAdmin(prisma, 2, 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('permite que outro admin avalie um admin', async () => {
    const prisma = prismaWith([
      { id: 1, role: { name: 'ADMIN' } },
      { id: 2, role: { name: 'ADMIN' } },
    ]);
    await expect(assertAdminEvaluatedByOtherAdmin(prisma, 2, 1)).resolves.toBeUndefined();
  });

  it('não restringe a avaliação de quem não é admin', async () => {
    const prisma = prismaWith([
      { id: 3, role: { name: 'COLABORADOR' } },
      { id: 4, role: { name: 'GESTOR' } },
    ]);
    await expect(assertAdminEvaluatedByOtherAdmin(prisma, 4, 3)).resolves.toBeUndefined();
    await expect(assertAdminEvaluatedByOtherAdmin(prisma, 3, 3)).resolves.toBeUndefined();
  });
});
