import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue([]),
  getStats: jest.fn().mockResolvedValue({}),
  getAnomalySummary: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getTimeline: jest.fn().mockResolvedValue([]),
  getUserHistory: jest.fn().mockResolvedValue([]),
  verifyIntegrity: jest.fn().mockResolvedValue({ valid: true }),
  exportLogs: jest.fn().mockResolvedValue({ data: [] }),
};

const mockUser = { id: 1, email: 'admin@innova.com', role: { name: 'ADMIN' } };

describe('AuditController', () => {
  let controller: AuditController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AuditController>(AuditController);
  });

  it('findAll → chama svc.findAll', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('stats → chama svc.getStats', async () => {
    await controller.stats();
    expect(mockSvc.getStats).toHaveBeenCalled();
  });

  it('anomalies → chama svc.getAnomalySummary', async () => {
    await controller.anomalies();
    expect(mockSvc.getAnomalySummary).toHaveBeenCalled();
  });

  it('findOne → chama svc.findOne', async () => {
    await controller.findOne(1);
    expect(mockSvc.findOne).toHaveBeenCalledWith(1);
  });

  it('timeline → chama svc.getTimeline', async () => {
    await controller.timeline('User', 5);
    expect(mockSvc.getTimeline).toHaveBeenCalledWith('User', 5);
  });

  it('userHistory → chama svc.getUserHistory', async () => {
    await controller.userHistory(2);
    expect(mockSvc.getUserHistory).toHaveBeenCalledWith(2);
  });

  it('verify → chama svc.verifyIntegrity com limit default', async () => {
    await controller.verify();
    expect(mockSvc.verifyIntegrity).toHaveBeenCalledWith(100);
  });

  it('verify → chama svc.verifyIntegrity com limit custom', async () => {
    await controller.verify('50');
    expect(mockSvc.verifyIntegrity).toHaveBeenCalledWith(50);
  });

  it('export → chama svc.exportLogs', async () => {
    const filters = {} as any;
    await controller.export(mockUser as any, filters);
    expect(mockSvc.exportLogs).toHaveBeenCalledWith(filters, 1);
  });
});
