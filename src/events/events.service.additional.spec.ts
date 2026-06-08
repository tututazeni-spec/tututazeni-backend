import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  event: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  eventParticipant: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
  },
  eventFeedback: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 } }),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
};

const baseEvent = {
  id: 1,
  title: 'Workshop TypeScript',
  type: 'WORKSHOP',
  modalidade: 'PRESENCIAL',
  status: 'PUBLISHED',
  organizerId: 1,
  startAt: new Date('2026-07-01'),
  endAt: new Date('2026-07-01'),
  maxCapacity: 30,
  mandatory: false,
  organizer: { id: 1, fullName: 'Admin', avatarUrl: null },
  _count: { participants: 10 },
};

describe('EventsService (additional)', () => {
  let service: EventsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<EventsService>(EventsService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar eventos paginados com taxa de ocupação', async () => {
      mockPrisma.event.findMany.mockResolvedValue([baseEvent]);
      mockPrisma.event.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('occupancyRate');
      expect(result.data[0].occupancyRate).toBe(33);
    });

    it('deve filtrar por search, type, modalidade, status, upcoming', async () => {
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.event.count.mockResolvedValue(0);
      await service.findAll({
        search: 'workshop',
        type: 'WORKSHOP' as any,
        modalidade: 'PRESENCIAL' as any,
        upcoming: true,
      });
      expect(mockPrisma.event.findMany).toHaveBeenCalled();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar evento por id', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se evento não existe', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar evento', async () => {
      mockPrisma.event.create.mockResolvedValue(baseEvent);
      const result = await service.create(
        {
          title: 'Workshop TypeScript',
          type: 'WORKSHOP' as any,
          modalidade: 'PRESENCIAL' as any,
          startAt: '2026-07-01T09:00:00',
          endAt: '2026-07-01T17:00:00',
          maxCapacity: 30,
        } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar evento', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, title: 'Workshop TS Avançado' });
      const result = await service.update(1, { title: 'Workshop TS Avançado' } as any, 1, 'ADMIN');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se evento não existe', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any, 1, 'ADMIN')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publishEvent ─────────────────────────────────────────────

  describe('publishEvent', () => {
    it('deve publicar evento DRAFT', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ ...baseEvent, status: 'DRAFT' });
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, status: 'PUBLISHED' });
      const result = await service.publishEvent(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── cancelEvent ──────────────────────────────────────────────

  describe('cancelEvent', () => {
    it('deve cancelar evento', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, status: 'CANCELLED' });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      const result = await service.cancelEvent(
        1,
        { reason: 'Sem participantes suficientes' } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── registerParticipant ──────────────────────────────────────

  describe('registerParticipant', () => {
    it('deve registar participante em evento com vagas', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ ...baseEvent, _count: { participants: 5 } });
      mockPrisma.eventParticipant.findFirst.mockResolvedValue(null);
      mockPrisma.eventParticipant.create.mockResolvedValue({ id: 1, eventId: 1, userId: 2 });
      const result = await service.registerParticipant(1, 2);
      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se já registado', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.eventParticipant.findFirst.mockResolvedValue({ id: 1 });
      await expect(service.registerParticipant(1, 2)).rejects.toThrow(ConflictException);
    });

    it('deve lançar BadRequestException se evento cheio', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ ...baseEvent, _count: { participants: 30 } });
      mockPrisma.eventParticipant.findFirst.mockResolvedValue(null);
      await expect(service.registerParticipant(1, 2)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── checkIn ──────────────────────────────────────────────────

  describe('checkIn', () => {
    it('deve fazer check-in de participante', async () => {
      mockPrisma.eventParticipant.findFirst.mockResolvedValue({
        id: 1,
        userId: 2,
        status: 'REGISTERED',
      });
      mockPrisma.eventParticipant.update.mockResolvedValue({ id: 1, status: 'CHECKED_IN' });
      const result = await service.checkIn(1, { userId: 2 } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── submitFeedback ───────────────────────────────────────────

  describe('submitFeedback', () => {
    it('deve submeter feedback do evento', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.eventParticipant.findFirst.mockResolvedValue({ id: 1, status: 'CHECKED_IN' });
      mockPrisma.eventFeedback.create.mockResolvedValue({ id: 1, eventId: 1, rating: 5 });
      const result = await service.submitFeedback(
        1,
        { rating: 5, comment: 'Excelente!' } as any,
        2,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getEventStats ────────────────────────────────────────────

  describe('getEventStats', () => {
    it('deve retornar estatísticas do evento', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.eventParticipant.count.mockResolvedValue(10);
      mockPrisma.eventFeedback.aggregate.mockResolvedValue({ _avg: { rating: 4.5 } });
      const result = await service.getEventStats(1);
      expect(result).toBeDefined();
    });
  });
});
