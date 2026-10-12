import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PositionRequirementsService } from './position-requirements.service';

function makeService(over: Record<string, unknown> = {}) {
  const prisma: any = {
    position: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
    positionRequirement: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 9, positionId: 1, category: 'LANGUAGE' }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 9, ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 9, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    ...over,
  };
  Object.defineProperty(prisma, 'read', { get: () => prisma, configurable: true });
  return { service: new PositionRequirementsService(prisma), prisma };
}

describe('PositionRequirementsService', () => {
  it('create: rejeita nível académico inválido', async () => {
    const { service } = makeService();
    await expect(
      service.create(1, {
        category: 'ACADEMIC',
        title: 'Informática',
        level: 'ENSINO_MEDIO',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('create: rejeita nível CEFR inválido', async () => {
    const { service } = makeService();
    await expect(
      service.create(1, { category: 'LANGUAGE', title: 'Inglês', level: 'FLUENTE' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('create: EXPERIENCE exige minYears', async () => {
    const { service } = makeService();
    await expect(
      service.create(1, { category: 'EXPERIENCE', title: 'Experiência' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('create: persiste com mandatory=true por omissão', async () => {
    const { service, prisma } = makeService();
    await service.create(1, { category: 'LANGUAGE', title: 'Inglês', level: 'B2' } as any);
    expect(prisma.positionRequirement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        positionId: 1,
        category: 'LANGUAGE',
        level: 'B2',
        mandatory: true,
      }),
    });
  });

  it('create: 404 se o cargo não existe', async () => {
    const { service } = makeService({
      position: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.create(99, { category: 'CERTIFICATION', title: 'AWS' } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('update: 404 se o requisito não pertence ao cargo', async () => {
    const { service, prisma } = makeService();
    prisma.positionRequirement.findFirst.mockResolvedValue(null);
    await expect(service.update(1, 9, { title: 'x2' })).rejects.toThrow(NotFoundException);
  });

  it('update: valida o nível contra a categoria existente', async () => {
    const { service } = makeService();
    await expect(service.update(1, 9, { level: 'MESTRADO' })).rejects.toThrow(BadRequestException);
  });

  it('remove: apaga o requisito do cargo', async () => {
    const { service, prisma } = makeService();
    await expect(service.remove(1, 9)).resolves.toEqual({ id: 9, deleted: true });
    expect(prisma.positionRequirement.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });
});
