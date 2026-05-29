import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  auditLog: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
};

describe('AuditService (common)', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  describe('log', () => {
    it('deve criar log de auditoria', async () => {
      await service.log({ entity: 'User', entityId: 1, action: 'CREATE', userId: 1 });
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
