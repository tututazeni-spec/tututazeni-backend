import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = { auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) } };
const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
let queueEnabledValue = 'true';
const mockConfig = {
  get: jest.fn((key: string, def?: any) => (key === 'QUEUE_ENABLED' ? queueEnabledValue : def)),
};

describe('AuditService (common)', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    queueEnabledValue = 'true';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('audit'), useValue: mockQueue },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  it('enfileira o log quando a fila está activa', async () => {
    await service.log({ entity: 'User', entityId: 1, action: 'CREATE', userId: 1 });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'write',
      expect.objectContaining({ entity: 'User', action: 'CREATE', userId: 1 }),
      expect.any(Object),
    );
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('cai para escrita síncrona se enfileirar falhar (Redis em baixo)', async () => {
    mockQueue.add.mockRejectedValueOnce(new Error('redis down'));
    await service.log({ entity: 'User', entityId: 1, action: 'CREATE', userId: 1 });
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('escreve síncrono quando QUEUE_ENABLED=false', async () => {
    queueEnabledValue = 'false';
    await service.log({ entity: 'User', entityId: 1, action: 'CREATE', userId: 1 });
    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('logEntity enfileira com metadata stringificada', async () => {
    await service.logEntity(7, 'CREATE', 'FundingGrant', 'cuid123', { funderId: 'f1' });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'write',
      expect.objectContaining({
        userId: 7,
        action: 'CREATE',
        entity: 'FundingGrant',
        metadata: JSON.stringify({ funderId: 'f1', entityId: 'cuid123' }),
      }),
      expect.any(Object),
    );
  });
});
