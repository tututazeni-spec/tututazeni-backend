import { BadRequestException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import type { EmailPolicyConfig } from '../common/helpers/email-policy';

const enforce: EmailPolicyConfig = {
  emailDomain: 'carrinho-sa.com',
  emailPattern: '{primeiroNome}.{apelido}',
  emailPolicyMode: 'ENFORCE',
};

function build(policy: EmailPolicyConfig) {
  const user = {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const prisma = { user } as unknown as PrismaService;
  const settings = {
    getEmailPolicy: jest.fn().mockResolvedValue(policy),
    applyUserPolicy: jest.fn(async (d: unknown) => d),
    getUserPolicy: jest.fn(),
  } as unknown as SettingsService;
  const queue = { add: jest.fn() };
  const service = new UsersService(prisma, queue as never, settings);
  return { service, user };
}

describe('UsersService — formato de email do tenant', () => {
  it('ENFORCE: rejeita email fora do domínio sem tocar na BD', async () => {
    const { service, user } = build(enforce);
    await expect(
      service.create({ fullName: 'António Miguel', email: 'antonio@gmail.com' } as never),
    ).rejects.toThrow(BadRequestException);
    expect(user.findUnique).not.toHaveBeenCalled();
  });

  it('ENFORCE: duplicado devolve conflito com alternativas livres', async () => {
    const { service, user } = build(enforce);
    user.findUnique.mockResolvedValue({ id: 1 });
    await expect(
      service.create({
        fullName: 'António José Miguel',
        email: 'antonio.miguel@carrinho-sa.com',
      } as never),
    ).rejects.toThrow(/antonio\.jose@carrinho-sa\.com/);
    await expect(
      service.create({
        fullName: 'António José Miguel',
        email: 'antonio.miguel@carrinho-sa.com',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('SUGGEST: não bloqueia, só avisa (sem BD cai no conflito esperado)', async () => {
    const { service, user } = build({ ...enforce, emailPolicyMode: 'SUGGEST' });
    user.findUnique.mockResolvedValue({ id: 1 });
    // Chega ao teste de unicidade (409), logo a política não bloqueou.
    await expect(
      service.create({ fullName: 'Ana Sousa', email: 'ana@gmail.com' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sem emailDomain: sem restrições', async () => {
    const { service, user } = build({ ...enforce, emailDomain: null });
    user.findUnique.mockResolvedValue({ id: 1 });
    await expect(
      service.create({ fullName: 'Ana Sousa', email: 'ana@gmail.com' } as never),
    ).rejects.toThrow('Email já registado');
  });

  it('checkEmail: sugere, detecta homónimo e propõe alternativas', async () => {
    const { service, user } = build(enforce);
    user.findUnique.mockResolvedValue({ id: 9 });
    const res = await service.checkEmail('António Miguel');
    expect(res.suggestion).toBe('antonio.miguel@carrinho-sa.com');
    expect(res.taken).toBe(true);
    expect(res.alternatives[0]).toBe('antonio.miguel2@carrinho-sa.com');
    user.findMany.mockResolvedValue([]);
    const res2 = await service.checkEmail('António José Miguel');
    expect(res2.alternatives[0]).toBe('antonio.jose@carrinho-sa.com');
  });

  it('checkEmail: tenant sem domínio não restringe', async () => {
    const { service } = build({ ...enforce, emailDomain: null });
    expect((await service.checkEmail('Ana Sousa')).enforced).toBe(false);
  });
});
