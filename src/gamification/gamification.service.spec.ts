import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { GamificationService } from './gamification.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: {
  userPoints: { upsert: jest.Mock };
  badge: { findFirst: jest.Mock };
  badgeAward: { create: jest.Mock };
} = {
  userPoints: { upsert: jest.fn().mockResolvedValue({}) },
  badge: { findFirst: jest.fn().mockResolvedValue(null) },
  badgeAward: { create: jest.fn().mockResolvedValue({}) },
};

describe('GamificationService', () => {
  let service: GamificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [GamificationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<GamificationService>(GamificationService);
  });

  describe('awardPoints', () => {
    it('faz upsert incremental de UserPoints', async () => {
      await service.awardPoints(10, 50);
      expect(mockPrisma.userPoints.upsert).toHaveBeenCalledWith({
        where: { userId: 10 },
        create: { userId: 10, points: 50 },
        update: { points: { increment: 50 } },
      });
    });

    it('ignora pontos <= 0 sem tocar na BD', async () => {
      await service.awardPoints(10, 0);
      await service.awardPoints(10, -5);
      expect(mockPrisma.userPoints.upsert).not.toHaveBeenCalled();
    });

    it('nunca lança — erro de BD é engolido (efeito não-bloqueante)', async () => {
      mockPrisma.userPoints.upsert.mockRejectedValueOnce(new Error('db down'));
      await expect(service.awardPoints(10, 50)).resolves.toBeUndefined();
    });
  });

  describe('awardBadge', () => {
    it('resolve o badge por name e cria o BadgeAward', async () => {
      mockPrisma.badge.findFirst.mockResolvedValueOnce({ id: 7 });
      await service.awardBadge(10, 'COURSE_COMPLETE');
      expect(mockPrisma.badge.findFirst).toHaveBeenCalledWith({
        where: { name: 'COURSE_COMPLETE' },
      });
      expect(mockPrisma.badgeAward.create).toHaveBeenCalledWith({
        data: { userId: 10, badgeId: 7 },
      });
    });

    it('badge inexistente → no-op, não cria award nem lança', async () => {
      mockPrisma.badge.findFirst.mockResolvedValueOnce(null);
      await service.awardBadge(10, 'NAO_EXISTE');
      expect(mockPrisma.badgeAward.create).not.toHaveBeenCalled();
    });

    it('badgeCode vazio → no-op', async () => {
      await service.awardBadge(10, '');
      expect(mockPrisma.badge.findFirst).not.toHaveBeenCalled();
    });

    it('idempotente — award duplicado (P2002) não lança', async () => {
      mockPrisma.badge.findFirst.mockResolvedValueOnce({ id: 7 });
      const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
      Object.setPrototypeOf(p2002, Prisma.PrismaClientKnownRequestError.prototype);
      mockPrisma.badgeAward.create.mockRejectedValueOnce(p2002);
      await expect(service.awardBadge(10, 'COURSE_COMPLETE')).resolves.toBeUndefined();
    });

    it('outros erros de BD também são engolidos', async () => {
      mockPrisma.badge.findFirst.mockResolvedValueOnce({ id: 7 });
      mockPrisma.badgeAward.create.mockRejectedValueOnce(new Error('db down'));
      await expect(service.awardBadge(10, 'COURSE_COMPLETE')).resolves.toBeUndefined();
    });
  });
});
