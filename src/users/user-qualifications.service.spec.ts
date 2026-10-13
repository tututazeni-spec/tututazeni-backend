import { NotFoundException } from '@nestjs/common';
import { UserQualificationsService } from './user-qualifications.service';

const owner = { id: 7, role: { name: 'COLABORADOR' } } as any;
const other = { id: 8, role: { name: 'COLABORADOR' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

function makeService() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 7, priorExperienceYears: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    userQualification: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 3, userId: 7 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 3, ...data })),
      update: jest.fn().mockResolvedValue({ id: 3 }),
      delete: jest.fn().mockResolvedValue({}),
    },
    userLanguage: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 4, ...create })),
      findUnique: jest.fn().mockResolvedValue({ id: 4, userId: 7 }),
      delete: jest.fn().mockResolvedValue({}),
    },
    userExternalCertification: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 5, userId: 7 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 5, ...data })),
      update: jest.fn().mockResolvedValue({ id: 5 }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  Object.defineProperty(prisma, 'read', { get: () => prisma, configurable: true });
  return { service: new UserQualificationsService(prisma), prisma };
}

describe('UserQualificationsService — ownership', () => {
  it('o próprio utilizador adiciona habilitação', async () => {
    const { service, prisma } = makeService();
    await service.addQualification(
      7,
      { degree: 'LICENCIATURA', course: 'Informática' } as any,
      owner,
    );
    expect(prisma.userQualification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 7, degree: 'LICENCIATURA' }),
    });
  });

  it('RH adiciona habilitação a outro utilizador', async () => {
    const { service } = makeService();
    await expect(
      service.addQualification(7, { degree: 'MESTRADO', course: 'Gestão' } as any, rh),
    ).resolves.toBeDefined();
  });

  it('outro colaborador não escreve no perfil alheio (404, sem create)', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.addQualification(7, { degree: 'MESTRADO', course: 'Gestão' } as any, other),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.userQualification.create).not.toHaveBeenCalled();
  });

  it('outro colaborador não lê o perfil alheio', async () => {
    const { service } = makeService();
    await expect(service.getProfile(7, other)).rejects.toThrow(NotFoundException);
  });

  it('getProfile devolve as quatro secções ao dono (experiência nunca preenchida = null)', async () => {
    const { service } = makeService();
    await expect(service.getProfile(7, owner)).resolves.toEqual({
      qualifications: [],
      languages: [],
      certifications: [],
      priorExperienceYears: null,
    });
  });

  it('removeQualification: item de outro utilizador não é apagado através de /users/:userId alheio', async () => {
    const { service, prisma } = makeService();
    // item 3 pertence ao utilizador 7; pedido feito em nome do utilizador 8
    prisma.userQualification.findUnique.mockResolvedValue({ id: 3, userId: 7 });
    await expect(service.removeQualification(8, 3, other)).rejects.toThrow(NotFoundException);
    expect(prisma.userQualification.delete).not.toHaveBeenCalled();
  });

  it('removeQualification: RH não apaga um item através do userId errado', async () => {
    const { service, prisma } = makeService();
    // item 3 é do utilizador 7, mas o URL diz /users/9/...
    await expect(service.removeQualification(9, 3, rh)).rejects.toThrow(NotFoundException);
    expect(prisma.userQualification.delete).not.toHaveBeenCalled();
  });

  it('removeQualification: o dono apaga o seu item', async () => {
    const { service, prisma } = makeService();
    await expect(service.removeQualification(7, 3, owner)).resolves.toEqual({
      id: 3,
      deleted: true,
    });
    expect(prisma.userQualification.delete).toHaveBeenCalledWith({ where: { id: 3 } });
  });

  it('addLanguage faz upsert por [userId, language]', async () => {
    const { service, prisma } = makeService();
    await service.addLanguage(7, { language: 'Inglês', level: 'B2' } as any, owner);
    expect(prisma.userLanguage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_language: { userId: 7, language: 'Inglês' } } }),
    );
  });

  it('addCertification converte datas ISO para Date', async () => {
    const { service, prisma } = makeService();
    await service.addCertification(7, { name: 'AWS Cloud', expiresAt: '2027-01-01' } as any, owner);
    expect(prisma.userExternalCertification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 7, name: 'AWS Cloud', expiresAt: expect.any(Date) }),
    });
  });

  it('setExperience: só dono/RH', async () => {
    const { service, prisma } = makeService();
    await expect(service.setExperience(7, 4, other)).rejects.toThrow(NotFoundException);
    await service.setExperience(7, 4, owner);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { priorExperienceYears: 4 },
    });
  });
});
