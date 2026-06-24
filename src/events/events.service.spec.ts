import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventType } from './events.dto';

const mockPrisma = {
  event: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  eventParticipant: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  eventFeedback: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  certificate: { create: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  attendanceRecord: { create: jest.fn() },
};

const baseEvent = {
  id: 1,
  title: 'Workshop NestJS',
  type: EventType.WORKSHOP,
  modalidade: 'ONLINE',
  status: 'PUBLISHED',
  startAt: new Date(Date.now() + 86400000),
  endAt: new Date(Date.now() + 90000000),
  maxCapacity: 50,
  mandatory: false,
  organizer: { id: 1, fullName: 'Organizer', avatarUrl: null },
  participants: [],
  feedbacks: [],
  _count: { participants: 10, feedbacks: 0 },
};

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<EventsService>(EventsService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar eventos com isFull e occupancyRate', async () => {
      mockPrisma.event.findMany.mockResolvedValue([baseEvent]);
      mockPrisma.event.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).isFull).toBe(false);
      expect((result.data[0] as any).occupancyRate).toBe(20);
    });

    it('deve marcar isFull quando maxCapacity atingida', async () => {
      mockPrisma.event.findMany.mockResolvedValue([
        {
          ...baseEvent,
          maxCapacity: 10,
          _count: { participants: 10, feedbacks: 0 },
        },
      ]);
      mockPrisma.event.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect((result.data[0] as any).isFull).toBe(true);
      expect((result.data[0] as any).occupancyRate).toBe(100);
    });

    it('deve filtrar upcoming', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.event.count.mockResolvedValue(0);

      await service.findAll({ upcoming: true });

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ startAt: expect.any(Object) }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar evento com métricas de feedback', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        feedbacks: [{ nps: 9, rating: 5, instructorRating: 5 }],
        _count: { participants: 10, feedbacks: 1 },
      });

      const result = await service.findOne(1);

      expect((result as any).avgNps).toBe(9);
      expect((result as any).isFull).toBe(false);
    });

    it('deve retornar avgNps null se sem feedbacks', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ ...baseEvent, feedbacks: [] });

      const result = await service.findOne(1);

      expect((result as any).avgNps).toBeNull();
      expect((result as any).avgRating).toBeNull();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar evento com sucesso', async () => {
      mockPrisma.event.create.mockResolvedValue(baseEvent);

      const result = await service.create(1, {
        title: 'Workshop NestJS',
        type: EventType.WORKSHOP,
        startAt: new Date().toISOString(),
        endAt: new Date().toISOString(),
      });

      expect(result.title).toBe('Workshop NestJS');
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar evento', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, title: 'Actualizado' });

      const result = await service.update(1, { title: 'Actualizado' });

      expect(result.title).toBe('Actualizado');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { title: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar evento completo', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, status: 'PUBLISHED' });

      const result = await service.publish(1);

      expect(result.status).toBe('PUBLISHED');
    });

    it('deve lançar BadRequestException se título em falta', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ ...baseEvent, title: null });
      await expect(service.publish(1)).rejects.toThrow(BadRequestException);
    });
  });
});
