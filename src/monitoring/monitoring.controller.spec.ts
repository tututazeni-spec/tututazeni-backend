import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  createOkrCycle: jest.fn().mockResolvedValue({ id: 1 }),
  findAllCycles: jest.fn().mockResolvedValue([]),
  createObjective: jest.fn().mockResolvedValue({ id: 1 }),
  findObjectives: jest.fn().mockResolvedValue([]),
  createKeyResult: jest.fn().mockResolvedValue({ id: 1 }),
  updateKeyResult: jest.fn().mockResolvedValue({ id: 1 }),
  createIndicator: jest.fn().mockResolvedValue({ id: 1 }),
  findAllIndicators: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  addRecord: jest.fn().mockResolvedValue({ id: 1 }),
  getIndicatorHistory: jest.fn().mockResolvedValue([]),
  createEvalCycle: jest.fn().mockResolvedValue({ id: 1 }),
  assignEvaluation: jest.fn().mockResolvedValue({ id: 1 }),
  submitEvaluation: jest.fn().mockResolvedValue({}),
  getMyEvaluations: jest.fn().mockResolvedValue([]),
  getEvaluationsToComplete: jest.fn().mockResolvedValue([]),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('MonitoringController', () => {
  let controller: MonitoringController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonitoringController],
      providers: [{ provide: MonitoringService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<MonitoringController>(MonitoringController);
  });

  it('getDashboard → getDashboard()', async () => {
    await controller.getDashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalled();
  });

  it('createOkrCycle → createOkrCycle(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createOkrCycle(dto, mockUser as any);
    expect(mockSvc.createOkrCycle).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllCycles → findAllCycles()', async () => {
    await controller.findAllCycles();
    expect(mockSvc.findAllCycles).toHaveBeenCalled();
  });

  it('createObjective → createObjective(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createObjective(dto, mockUser as any);
    expect(mockSvc.createObjective).toHaveBeenCalledWith(dto, 1);
  });

  it('findObjectives sem ownerId → findObjectives(cycleId, undefined)', async () => {
    await controller.findObjectives('cy1');
    expect(mockSvc.findObjectives).toHaveBeenCalledWith('cy1', undefined);
  });

  it('findObjectives com ownerId → findObjectives(cycleId, Number(ownerId))', async () => {
    await controller.findObjectives('cy1', '5');
    expect(mockSvc.findObjectives).toHaveBeenCalledWith('cy1', 5);
  });

  it('createKeyResult → createKeyResult(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createKeyResult(dto, mockUser as any);
    expect(mockSvc.createKeyResult).toHaveBeenCalledWith(dto, 1);
  });

  it('updateKeyResult → updateKeyResult(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.updateKeyResult('kr1', dto, mockUser as any);
    expect(mockSvc.updateKeyResult).toHaveBeenCalledWith('kr1', dto, mockUser);
  });

  it('createIndicator → createIndicator(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createIndicator(dto, mockUser as any);
    expect(mockSvc.createIndicator).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllIndicators → findAllIndicators(filters)', async () => {
    await controller.findAllIndicators({ page: 1, limit: 20, category: 'financeiro' } as any);
    expect(mockSvc.findAllIndicators).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      category: 'financeiro',
    });
  });

  it('addRecord → addRecord(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.addRecord('ind1', dto, mockUser as any);
    expect(mockSvc.addRecord).toHaveBeenCalledWith('ind1', dto, 1);
  });

  it('getIndicatorHistory → getIndicatorHistory(id)', async () => {
    await controller.getIndicatorHistory('ind1');
    expect(mockSvc.getIndicatorHistory).toHaveBeenCalledWith('ind1');
  });

  it('createEvalCycle → createEvalCycle(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createEvalCycle(dto, mockUser as any);
    expect(mockSvc.createEvalCycle).toHaveBeenCalledWith(dto, 1);
  });

  it('assignEvaluation com type → assignEvaluation(cycleId, userId, evaluatorId, type, actorId)', async () => {
    await controller.assignEvaluation('cy1', 2, 3, 'PEER', mockUser as any);
    expect(mockSvc.assignEvaluation).toHaveBeenCalledWith('cy1', 2, 3, 'PEER', 1);
  });

  it('assignEvaluation sem type → usa MANAGER por omissão', async () => {
    await controller.assignEvaluation('cy1', 2, 3, undefined as any, mockUser as any);
    expect(mockSvc.assignEvaluation).toHaveBeenCalledWith('cy1', 2, 3, 'MANAGER', 1);
  });

  it('submitEvaluation → submitEvaluation(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.submitEvaluation('ev1', dto, mockUser as any);
    expect(mockSvc.submitEvaluation).toHaveBeenCalledWith('ev1', dto, mockUser);
  });

  it('getMyEvaluations → getMyEvaluations(userId)', async () => {
    await controller.getMyEvaluations(mockUser as any);
    expect(mockSvc.getMyEvaluations).toHaveBeenCalledWith(1);
  });

  it('getEvaluationsToComplete → getEvaluationsToComplete(userId)', async () => {
    await controller.getEvaluationsToComplete(mockUser as any);
    expect(mockSvc.getEvaluationsToComplete).toHaveBeenCalledWith(1);
  });
});
