import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  auditLog: {
    create: jest.fn().mockResolvedValue({ id: 1, hash: 'abc123' }),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
};

describe('AuditService', () => {
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
      const result = await service.log({
        userId: 1,
        action: 'CREATE',
        entity: 'User',
        entityId: 1,
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('logCreate', () => {
    it('deve criar log de criação', async () => {
      await service.logCreate(1, 'User', 1, { name: 'Test' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATE', entity: 'User' }),
        }),
      );
    });
  });

  describe('logUpdate', () => {
    it('deve criar log de actualização', async () => {
      await service.logUpdate(1, 'User', 1, { name: 'Old' }, { name: 'New' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'UPDATE', entity: 'User' }),
        }),
      );
    });
  });

  describe('logDelete', () => {
    it('deve criar log de eliminação', async () => {
      await service.logDelete(1, 'User', 1, { name: 'Deleted' });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'DELETE', entity: 'User' }),
        }),
      );
    });
  });
});
