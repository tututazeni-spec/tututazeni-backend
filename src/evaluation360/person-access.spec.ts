import { NotFoundException } from '@nestjs/common';
import { assertCanViewPerson } from './person-access';

const caller = (id: number, role: string) => ({ id, role: { name: role } }) as never;

describe('assertCanViewPerson (feedback/progresso de outra pessoa)', () => {
  const managerOf = (managerId: number | null) => jest.fn().mockResolvedValue(managerId);

  it('o próprio vê', async () => {
    await expect(
      assertCanViewPerson('7', caller(7, 'COLABORADOR'), managerOf(3)),
    ).resolves.toBeUndefined();
  });

  it.each(['ADMIN', 'RH', 'AUDITOR', 'DIRECTOR'])('%s vê qualquer pessoa', async role => {
    const lookup = managerOf(3);
    await expect(assertCanViewPerson('7', caller(1, role), lookup)).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('o chefe direto vê', async () => {
    await expect(
      assertCanViewPerson('7', caller(3, 'GESTOR'), managerOf(3)),
    ).resolves.toBeUndefined();
  });

  it('colega, gestor de outra equipa e instrutor recebem 404', async () => {
    for (const role of ['COLABORADOR', 'GESTOR', 'LIDER', 'INSTRUCTOR']) {
      await expect(assertCanViewPerson('7', caller(99, role), managerOf(3))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
  });

  it('pessoa sem chefe: só próprio/privilegiados', async () => {
    await expect(
      assertCanViewPerson('7', caller(99, 'GESTOR'), managerOf(null)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
