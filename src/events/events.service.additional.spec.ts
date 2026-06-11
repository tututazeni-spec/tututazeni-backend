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
  feedbacks: [],
  participants: [],
  _count: { participants: 10, feedbacks: 0 },
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
      // Real signature: create(organizerId, dto) — organizerId first, dto second
      const result = await service.create(1, {
        title: 'Workshop TypeScript',
        type: 'WORKSHOP' as any,
        modalidade: 'PRESENCIAL' as any,
        startAt: '2026-07-01T09:00:00',
        endAt: '2026-07-01T17:00:00',
        maxCapacity: 30,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar evento', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, title: 'Workshop TS Avançado' });
      // Real signature: update(id, dto) — 2 args only
      const result = await service.update(1, { title: 'Workshop TS Avançado' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se evento não existe', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publish (real method name) ───────────────────────────────

  describe('publish', () => {
    it('deve publicar evento DRAFT', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        status: 'DRAFT',
        feedbacks: [],
        participants: [],
        _count: { participants: 0, feedbacks: 0 },
      });
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, status: 'PUBLISHED' });
      // Real method: publish(id) — 1 arg
      const result = await service.publish(1);
      expect(result).toBeDefined();
    });
  });

  // ─── cancel (real method name) ────────────────────────────────

  describe('cancel', () => {
    it('deve cancelar evento', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        feedbacks: [],
        participants: [],
        _count: { participants: 0, feedbacks: 0 },
      });
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, status: 'CANCELLED' });
      mockPrisma.eventParticipant.findMany.mockResolvedValue([]);
      mockPrisma.notificationLog.createMany = jest.fn().mockResolvedValue({ count: 0 });
      // Real method: cancel(id) — 1 arg
      const result = await service.cancel(1);
      expect(result).toBeDefined();
    });
  });

  // ─── join (replaces registerParticipant) ─────────────────────

  describe('join', () => {
    it('deve registar participante em evento com vagas', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        feedbacks: [],
        participants: [],
        _count: { participants: 5 },
        status: 'PUBLISHED',
        waitlistEnabled: false,
      });
      mockPrisma.eventParticipant.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.eventParticipant.count.mockResolvedValue(5);
      mockPrisma.eventParticipant.upsert = jest
        .fn()
        .mockResolvedValue({ id: 1, eventId: 1, userId: 2 });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      mockPrisma.userPoints = { upsert: jest.fn().mockResolvedValue({}) };
      // Real method: join(eventId, userId)
      const result = await service.join(1, 2);
      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se já registado', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        feedbacks: [],
        participants: [],
        _count: { participants: 5 },
        status: 'PUBLISHED',
      });
      mockPrisma.eventParticipant.findUnique = jest
        .fn()
        .mockResolvedValue({ id: 1, status: 'CONFIRMED' });
      await expect(service.join(1, 2)).rejects.toThrow(ConflictException);
    });

    it('deve lançar BadRequestException se evento cheio e sem waitlist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        feedbacks: [],
        participants: [],
        _count: { participants: 30 },
        maxCapacity: 30,
        status: 'PUBLISHED',
        waitlistEnabled: false,
      });
      mockPrisma.eventParticipant.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.eventParticipant.count.mockResolvedValue(30);
      await expect(service.join(1, 2)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── checkIn ──────────────────────────────────────────────────

  describe('checkIn', () => {
    it('deve fazer check-in de participante', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.eventParticipant.findUnique = jest.fn().mockResolvedValue({
        id: 1,
        eventId: 1,
        userId: 2,
        status: 'CONFIRMED',
      });
      mockPrisma.eventParticipant.update.mockResolvedValue({ id: 1, status: 'PRESENT' });
      mockPrisma.userPoints = { upsert: jest.fn().mockResolvedValue({}) };
      // Real signature: checkIn(userId, dto) — userId first, dto with eventId
      const result = await service.checkIn(2, { eventId: 1 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── submitFeedback ───────────────────────────────────────────

  describe('submitFeedback', () => {
    it('deve submeter feedback do evento', async () => {
      mockPrisma.eventParticipant.findUnique = jest.fn().mockResolvedValue({
        id: 1,
        status: 'PRESENT',
      });
      mockPrisma.eventFeedback = {
        upsert: jest.fn().mockResolvedValue({ id: 1, eventId: 1, nps: 9, rating: 5 }),
      };
      mockPrisma.userPoints = { upsert: jest.fn().mockResolvedValue({}) };
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent);
      mockPrisma.certificate = { findFirst: jest.fn().mockResolvedValue(null) };
      // Real signature: submitFeedback(eventId, userId, dto)
      const result = await service.submitFeedback(1, 2, { nps: 9, rating: 5 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getStats (replaces getEventStats) ────────────────────────

  describe('getStats', () => {
    it('deve retornar estatísticas gerais de eventos', async () => {
      mockPrisma.event.groupBy = jest.fn().mockResolvedValue([]);
      mockPrisma.event.count.mockResolvedValue(10);
      mockPrisma.eventParticipant.count.mockResolvedValue(100);
      // Real method: getStats() — no args, returns global stats
      const result = await service.getStats();
      expect(result).toBeDefined();
    });
  });
});
