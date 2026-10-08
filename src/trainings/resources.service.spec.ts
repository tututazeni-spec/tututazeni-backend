import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TrainingResourceService } from './resources.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  trainingResource: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  trainingResourceBooking: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const baseResource = { id: 1, kind: 'ROOM', name: 'Sala 101', status: 'AVAILABLE' };

describe('TrainingResourceService', () => {
  let service: TrainingResourceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingResourceService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingResourceService>(TrainingResourceService);
  });

  describe('checkAvailability', () => {
    it('disponível quando não há reservas sobrepostas', async () => {
      mockPrisma.trainingResourceBooking.findMany.mockResolvedValue([]);
      const result = await service.checkAvailability(
        1,
        '2027-01-01T09:00:00Z',
        '2027-01-01T12:00:00Z',
      );
      expect(result.available).toBe(true);
    });

    it('indisponível quando há reserva sobreposta', async () => {
      mockPrisma.trainingResourceBooking.findMany.mockResolvedValue([{ id: 5 }]);
      const result = await service.checkAvailability(
        1,
        '2027-01-01T09:00:00Z',
        '2027-01-01T12:00:00Z',
      );
      expect(result.available).toBe(false);
      expect(result.conflicts).toHaveLength(1);
    });
  });

  describe('reserve', () => {
    it('lança NotFoundException se o recurso não existe', async () => {
      mockPrisma.trainingResource.findUnique.mockResolvedValue(null);
      await expect(
        service.reserve(
          { resourceId: 99, startAt: '2027-01-01T09:00:00Z', endAt: '2027-01-01T12:00:00Z' } as any,
          1,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('lança BadRequestException se o recurso não está disponível', async () => {
      mockPrisma.trainingResource.findUnique.mockResolvedValue({ id: 1, status: 'MAINTENANCE' });
      await expect(
        service.reserve(
          { resourceId: 1, startAt: '2027-01-01T09:00:00Z', endAt: '2027-01-01T12:00:00Z' } as any,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança ConflictException se já reservado no período', async () => {
      mockPrisma.trainingResource.findUnique.mockResolvedValue(baseResource);
      mockPrisma.trainingResourceBooking.findMany.mockResolvedValue([{ id: 3 }]);
      await expect(
        service.reserve(
          { resourceId: 1, startAt: '2027-01-01T09:00:00Z', endAt: '2027-01-01T12:00:00Z' } as any,
          1,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('cria a reserva quando disponível', async () => {
      mockPrisma.trainingResource.findUnique.mockResolvedValue(baseResource);
      mockPrisma.trainingResourceBooking.findMany.mockResolvedValue([]);
      mockPrisma.trainingResourceBooking.create.mockResolvedValue({ id: 10 });
      const result = await service.reserve(
        {
          resourceId: 1,
          trainingId: 7,
          startAt: '2027-01-01T09:00:00Z',
          endAt: '2027-01-01T12:00:00Z',
        } as any,
        1,
      );
      expect(result).toEqual({ id: 10 });
      expect(mockPrisma.trainingResourceBooking.create).toHaveBeenCalled();
    });
  });

  describe('release', () => {
    it('lança NotFoundException se a reserva não existe', async () => {
      mockPrisma.trainingResourceBooking.findUnique.mockResolvedValue(null);
      await expect(service.release(99)).rejects.toThrow(NotFoundException);
    });

    it('liberta a reserva', async () => {
      mockPrisma.trainingResourceBooking.findUnique.mockResolvedValue({ id: 1, releasedAt: null });
      const result = await service.release(1);
      expect(result).toEqual({ message: 'Recurso libertado' });
      expect(mockPrisma.trainingResourceBooking.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('bloqueia eliminação com reservas activas', async () => {
      mockPrisma.trainingResource.findUnique.mockResolvedValue(baseResource);
      mockPrisma.trainingResourceBooking.count.mockResolvedValue(1);
      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });
  });
});
