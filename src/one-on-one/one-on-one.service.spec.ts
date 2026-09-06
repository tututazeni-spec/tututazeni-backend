import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OneOnOneService } from './one-on-one.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  oneOnOneMeeting: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

describe('OneOnOneService', () => {
  let service: OneOnOneService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [OneOnOneService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<OneOnOneService>(OneOnOneService);
  });

  describe('schedule', () => {
    it('cria com host/participant e defaults (durationMinutes 30, recurring false, SCHEDULED)', async () => {
      mockPrisma.oneOnOneMeeting.create.mockResolvedValue({ id: 1 });
      await service.schedule({
        hostId: 10,
        participantId: 20,
        scheduledAt: '2026-02-01T10:00:00Z',
      });
      expect(mockPrisma.oneOnOneMeeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hostId: 10,
            participantId: 20,
            durationMinutes: 30,
            recurring: false,
            status: 'SCHEDULED',
            scheduledAt: expect.any(Date),
          }),
        }),
      );
    });

    it('propaga recurring/frequency quando enviados', async () => {
      mockPrisma.oneOnOneMeeting.create.mockResolvedValue({ id: 1 });
      await service.schedule({
        hostId: 1,
        participantId: 2,
        scheduledAt: new Date(),
        recurring: true,
        frequency: 'WEEKLY',
      });
      expect(mockPrisma.oneOnOneMeeting.create.mock.calls[0][0].data).toMatchObject({
        recurring: true,
        frequency: 'WEEKLY',
      });
    });
  });

  describe('getOne', () => {
    it('inexistente → NotFoundException', async () => {
      mockPrisma.oneOnOneMeeting.findUnique.mockResolvedValue(null);
      await expect(service.getOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listForUser', () => {
    it('default: reuniões onde é host OU participant', async () => {
      mockPrisma.oneOnOneMeeting.findMany.mockResolvedValue([]);
      await service.listForUser(10);
      expect(mockPrisma.oneOnOneMeeting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ hostId: 10 }, { participantId: 10 }] },
        }),
      );
    });

    it('hostOnly + otherPartyId restringe a host + participant', async () => {
      mockPrisma.oneOnOneMeeting.findMany.mockResolvedValue([]);
      await service.listForUser(10, { hostOnly: true, otherPartyId: 42 });
      expect(mockPrisma.oneOnOneMeeting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hostId: 10, participantId: 42 } }),
      );
    });
  });

  describe('update', () => {
    it('converte scheduledAt e nextMeetingDate para Date', async () => {
      mockPrisma.oneOnOneMeeting.update.mockResolvedValue({ id: 1 });
      await service.update(1, { scheduledAt: '2026-03-01', nextMeetingDate: '2026-04-01' });
      const data = mockPrisma.oneOnOneMeeting.update.mock.calls[0][0].data;
      expect(data.scheduledAt).toBeInstanceOf(Date);
      expect(data.nextMeetingDate).toBeInstanceOf(Date);
    });

    it('nextMeetingDate null → grava null', async () => {
      mockPrisma.oneOnOneMeeting.update.mockResolvedValue({ id: 1 });
      await service.update(1, { nextMeetingDate: null });
      expect(mockPrisma.oneOnOneMeeting.update.mock.calls[0][0].data.nextMeetingDate).toBeNull();
    });
  });

  describe('complete', () => {
    it('grava status COMPLETED + completedAt + minutes', async () => {
      mockPrisma.oneOnOneMeeting.update.mockResolvedValue({ id: 1, status: 'COMPLETED' });
      await service.complete(1, { minutes: 'acta' });
      expect(mockPrisma.oneOnOneMeeting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            completedAt: expect.any(Date),
            minutes: 'acta',
          }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('grava status CANCELLED', async () => {
      mockPrisma.oneOnOneMeeting.update.mockResolvedValue({ id: 1, status: 'CANCELLED' });
      await service.cancel(1);
      expect(mockPrisma.oneOnOneMeeting.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'CANCELLED' },
      });
    });
  });
});
