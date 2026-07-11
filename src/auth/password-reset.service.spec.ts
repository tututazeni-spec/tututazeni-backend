// src/auth/password-reset.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('bcrypt-hash') }));

const GENERIC = 'Se o email existir, receberás instruções de recuperação';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    refreshToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('PasswordResetService', () => {
  const mail = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };

  afterEach(() => jest.clearAllMocks());

  it('forgotPassword devolve mensagem genérica e cria token quando o user existe', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'u@i.com', active: true });
    const svc = new PasswordResetService(prisma as any, mail as any);

    const res = await svc.forgotPassword('u@i.com');

    expect(res.message).toBe(GENERIC);
    expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    expect(mail.sendPasswordReset).toHaveBeenCalledWith('u@i.com', expect.any(String));
  });

  it('forgotPassword devolve a MESMA mensagem e não cria token quando o user não existe', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    const svc = new PasswordResetService(prisma as any, mail as any);

    const res = await svc.forgotPassword('nao@existe.com');

    expect(res.message).toBe(GENERIC);
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('resetPassword rejeita token inexistente', async () => {
    const prisma = makePrisma();
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);
    const svc = new PasswordResetService(prisma as any, mail as any);

    await expect(svc.resetPassword('mau', 'NovaSenha123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resetPassword rejeita token já usado', async () => {
    const prisma = makePrisma();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 1,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 1e6),
    });
    const svc = new PasswordResetService(prisma as any, mail as any);

    await expect(svc.resetPassword('tok', 'NovaSenha123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resetPassword rejeita token expirado', async () => {
    const prisma = makePrisma();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1,
      userId: 1,
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    const svc = new PasswordResetService(prisma as any, mail as any);

    await expect(svc.resetPassword('tok', 'NovaSenha123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resetPassword válido actualiza senha, passwordChangedAt, marca usedAt e revoga refresh', async () => {
    const prisma = makePrisma();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 5,
      userId: 7,
      usedAt: null,
      expiresAt: new Date(Date.now() + 1e6),
    });
    const svc = new PasswordResetService(prisma as any, mail as any);

    const res = await svc.resetPassword('tok', 'NovaSenha123');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          password: 'bcrypt-hash',
          passwordChangedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7, revokedAt: null } }),
    );
    expect(res.message).toBeDefined();
  });
});
