import { Test, TestingModule } from '@nestjs/testing';
import { MobileService } from './mobile.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  mobileSession: {
    upsert: jest.fn().mockResolvedValue({ id: 1, userId: 1, deviceId: 'dev-1' }),
    create: jest.fn().mockResolvedValue({ id: 1, userId: 1, deviceId: 'dev-1' }),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  mobileSyncLog: { create: jest.fn().mockResolvedValue({}) },
  enrollment: { findMany: jest.fn().mockResolvedValue([]) },
  evaluationAttempt: { findMany: jest.fn().mockResolvedValue([]) },
};

describe('MobileService', () => {
  let service: MobileService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [MobileService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<MobileService>(MobileService);
  });

  describe('registerSession', () => {
    it('deve registar sessão mobile', async () => {
      const result = await service.registerSession(1, 'dev-123', 'android', 'token');
      expect(result).toBeDefined();
    });
  });

  describe('logSync', () => {
    it('deve registar log de sincronização', async () => {
      await service.logSync(1, 'Enrollment', 'SUCCESS');
      expect(mockPrisma.mobileSyncLog.create).toHaveBeenCalled();
    });
  });

  describe('getUserMobileDashboard', () => {
    it('deve retornar dashboard mobile', async () => {
      mockPrisma.mobileSession.findFirst.mockResolvedValue({ id: 1, deviceId: 'dev-1', pushToken: 'token' });
      const result = await service.getUserMobileDashboard(1);
      expect(result).toBeDefined();
    });
  });
});
