import { Test, TestingModule } from '@nestjs/testing';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  createCycle: jest.fn().mockResolvedValue({ id: 1 }),
  getCycles: jest.fn().mockResolvedValue([]),
  getCycle: jest.fn().mockResolvedValue({ id: 1 }),
  updateCycle: jest.fn().mockResolvedValue({}),
  publishCycle: jest.fn().mockResolvedValue({}),
  activateCycle: jest.fn().mockResolvedValue({}),
  createForm: jest.fn().mockResolvedValue({ id: 1 }),
  getForms: jest.fn().mockResolvedValue([]),
  getForm: jest.fn().mockResolvedValue({ id: 1 }),
  assignEvaluator: jest.fn().mockResolvedValue({}),
  bulkAssign: jest.fn().mockResolvedValue({}),
  submitEvaluation: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  getPendingEvaluations: jest.fn().mockResolvedValue([]),
  getMyProgress: jest.fn().mockResolvedValue({}),
  findByUser: jest.fn().mockResolvedValue([]),
  getSummary: jest.fn().mockResolvedValue({}),
  getResults: jest.fn().mockResolvedValue({}),
  getUserEvolution: jest.fn().mockResolvedValue([]),
  getCycleForCalibration: jest.fn().mockResolvedValue({}),
  calibrateScore: jest.fn().mockResolvedValue({}),
  getAnalyticsDashboard: jest.fn().mockResolvedValue({}),
  getTeamDashboard: jest.fn().mockResolvedValue({}),
  triggerPDIFromResults: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('EvaluationController', () => {
  let controller: EvaluationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EvaluationController],
      providers: [{ provide: EvaluationService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<EvaluationController>(EvaluationController);
  });

  it('createCycle → createCycle(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createCycle(dto, mockUser as any);
    expect(mockSvc.createCycle).toHaveBeenCalledWith(dto, 1);
  });

  it('getCycles → getCycles(filters)', async () => {
    const filters = {} as any;
    await controller.getCycles(filters);
    expect(mockSvc.getCycles).toHaveBeenCalledWith(filters);
  });

  it('getCycle → getCycle(id)', async () => {
    await controller.getCycle(2);
    expect(mockSvc.getCycle).toHaveBeenCalledWith(2);
  });

  it('updateCycle → updateCycle(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateCycle(1, dto);
    expect(mockSvc.updateCycle).toHaveBeenCalledWith(1, dto);
  });

  it('publishCycle → publishCycle(id)', async () => {
    await controller.publishCycle(1);
    expect(mockSvc.publishCycle).toHaveBeenCalledWith(1);
  });

  it('activateCycle → activateCycle(id)', async () => {
    await controller.activateCycle(1);
    expect(mockSvc.activateCycle).toHaveBeenCalledWith(1);
  });

  it('createForm → createForm(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createForm(dto, mockUser as any);
    expect(mockSvc.createForm).toHaveBeenCalledWith(dto, 1);
  });

  it('getForms → getForms', async () => {
    await controller.getForms();
    expect(mockSvc.getForms).toHaveBeenCalled();
  });

  it('getForm → getForm(id)', async () => {
    await controller.getForm(3);
    expect(mockSvc.getForm).toHaveBeenCalledWith(3);
  });

  it('assign → assignEvaluator(dto)', async () => {
    const dto = {} as any;
    await controller.assign(dto);
    expect(mockSvc.assignEvaluator).toHaveBeenCalledWith(dto);
  });

  it('bulkAssign → bulkAssign(dto)', async () => {
    const dto = {} as any;
    await controller.bulkAssign(dto);
    expect(mockSvc.bulkAssign).toHaveBeenCalledWith(dto);
  });

  it('submit → submitEvaluation(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submit(mockUser as any, dto);
    expect(mockSvc.submitEvaluation).toHaveBeenCalledWith(1, dto);
  });

  it('create (legacy) → create(userId, dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(1, dto);
  });

  it('pending → getPendingEvaluations(userId)', async () => {
    await controller.pending(mockUser as any);
    expect(mockSvc.getPendingEvaluations).toHaveBeenCalledWith(1);
  });

  it('myProgress → getMyProgress(userId)', async () => {
    await controller.myProgress(mockUser as any);
    expect(mockSvc.getMyProgress).toHaveBeenCalledWith(1);
  });

  it('myEvals → findByUser(userId, period)', async () => {
    await controller.myEvals(mockUser as any);
    expect(mockSvc.findByUser).toHaveBeenCalledWith(1, undefined);
  });

  it('byUser → findByUser(userId)', async () => {
    await controller.byUser(3);
    expect(mockSvc.findByUser).toHaveBeenCalledWith(3, undefined);
  });

  it('summary → getSummary(userId, period)', async () => {
    await controller.summary(2, '2024');
    expect(mockSvc.getSummary).toHaveBeenCalledWith(2, '2024');
  });

  it('results sem cycleId → getResults(userId, undefined)', async () => {
    await controller.results(4, undefined, mockUser as any);
    expect(mockSvc.getResults).toHaveBeenCalledWith(4, undefined);
  });

  it('results com cycleId → getResults(userId, parsed)', async () => {
    await controller.results(4, '3', mockUser as any);
    expect(mockSvc.getResults).toHaveBeenCalledWith(4, 3);
  });

  it('evolution → getUserEvolution(userId)', async () => {
    await controller.evolution(5, mockUser as any);
    expect(mockSvc.getUserEvolution).toHaveBeenCalledWith(5);
  });

  // A10-3: results/:userId e evolution/:userId aceitavam @Roles(ALL_ROLES) sem
  // ownership — qualquer COLABORADOR lia o 360 completo de qualquer colega.
  describe('results/evolution — ownership (A10-3)', () => {
    const other = { id: 2, email: 'other@innova.com', role: { name: 'COLABORADOR' } };
    const owner = { id: 4, email: 'owner@innova.com', role: { name: 'COLABORADOR' } };
    const manager = { id: 9, email: 'mgr@innova.com', role: { name: 'LIDER' } };

    it('colaborador não pode ver results de outro utilizador → excepção', () => {
      expect(() => controller.results(4, undefined, other as any)).toThrow();
      expect(mockSvc.getResults).not.toHaveBeenCalled();
    });

    it('colaborador pode ver os seus próprios results', async () => {
      await controller.results(4, undefined, owner as any);
      expect(mockSvc.getResults).toHaveBeenCalledWith(4, undefined);
    });

    it('LIDER pode ver results de qualquer colaborador', async () => {
      await controller.results(4, undefined, manager as any);
      expect(mockSvc.getResults).toHaveBeenCalledWith(4, undefined);
    });

    it('colaborador não pode ver evolution de outro utilizador → excepção', () => {
      expect(() => controller.evolution(4, other as any)).toThrow();
      expect(mockSvc.getUserEvolution).not.toHaveBeenCalled();
    });

    it('colaborador pode ver a sua própria evolution', async () => {
      await controller.evolution(4, owner as any);
      expect(mockSvc.getUserEvolution).toHaveBeenCalledWith(4);
    });
  });

  it('calibrationPanel → getCycleForCalibration(cycleId)', async () => {
    await controller.calibrationPanel(2);
    expect(mockSvc.getCycleForCalibration).toHaveBeenCalledWith(2);
  });

  it('calibrate → calibrateScore(cycleId, dto, userId)', async () => {
    const dto = {} as any;
    await controller.calibrate(3, dto, mockUser as any);
    expect(mockSvc.calibrateScore).toHaveBeenCalledWith(3, dto, 1);
  });

  it('analyticsDashboard → getAnalyticsDashboard(filters)', async () => {
    const filters = {} as any;
    await controller.analyticsDashboard(filters);
    expect(mockSvc.getAnalyticsDashboard).toHaveBeenCalledWith(filters);
  });

  it('teamDashboard sem cycleId → getTeamDashboard(managerId, undefined)', async () => {
    await controller.teamDashboard(5);
    expect(mockSvc.getTeamDashboard).toHaveBeenCalledWith(5, undefined);
  });

  it('triggerPDI sem cycleId → triggerPDIFromResults(userId, undefined)', async () => {
    await controller.triggerPDI(3);
    expect(mockSvc.triggerPDIFromResults).toHaveBeenCalledWith(3, undefined);
  });
});
