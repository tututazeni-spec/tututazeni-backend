import { Test, TestingModule } from '@nestjs/testing';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { PdfService } from '../pdf/pdf.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockPdf = {
  generateExecutiveReport: jest.fn().mockResolvedValue(Buffer.from('')),
};

const mockSvc = {
  createCycle: jest.fn().mockResolvedValue({ id: 1 }),
  getCycles: jest.fn().mockResolvedValue([]),
  getCycle: jest.fn().mockResolvedValue({ id: 1 }),
  updateCycle: jest.fn().mockResolvedValue({}),
  publishCycle: jest.fn().mockResolvedValue({}),
  activateCycle: jest.fn().mockResolvedValue({}),
  pauseCycle: jest.fn().mockResolvedValue({}),
  closeCycle: jest.fn().mockResolvedValue({}),
  reopenCycle: jest.fn().mockResolvedValue({}),
  remindCycleParticipants: jest.fn().mockResolvedValue({ notified: 0 }),
  createForm: jest.fn().mockResolvedValue({ id: 1 }),
  getForms: jest.fn().mockResolvedValue([]),
  getForm: jest.fn().mockResolvedValue({ id: 1 }),
  assignEvaluator: jest.fn().mockResolvedValue({}),
  bulkAssign: jest.fn().mockResolvedValue({}),
  getEvaluationRequestsList: jest.fn().mockResolvedValue({ data: [], meta: {} }),
  getEvaluationRequestDetail: jest.fn().mockResolvedValue({}),
  updateEvaluationRequest: jest.fn().mockResolvedValue({}),
  remindEvaluationRequest: jest.fn().mockResolvedValue({ notified: true }),
  finishEvaluationRequest: jest.fn().mockResolvedValue({}),
  reopenEvaluationRequest: jest.fn().mockResolvedValue({}),
  advanceStage: jest.fn().mockResolvedValue({}),
  getOverviewDashboard: jest.fn().mockResolvedValue({ scope: 'personal' }),
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
  openCalibration: jest.fn().mockResolvedValue({}),
  confirmCalibration: jest.fn().mockResolvedValue({ advanced: 0 }),
  getCalibrationHistory: jest.fn().mockResolvedValue([]),
  getOneOnOne: jest.fn().mockResolvedValue(null),
  scheduleOneOnOne: jest.fn().mockResolvedValue({}),
  registerOneOnOne: jest.fn().mockResolvedValue({}),
  getReportsOverview: jest.fn().mockResolvedValue({}),
  getSettings: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('EvaluationController', () => {
  let controller: EvaluationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EvaluationController],
      providers: [
        { provide: EvaluationService, useValue: mockSvc },
        { provide: PdfService, useValue: mockPdf },
      ],
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

  it('pauseCycle → pauseCycle(id)', async () => {
    await controller.pauseCycle(1);
    expect(mockSvc.pauseCycle).toHaveBeenCalledWith(1);
  });

  it('closeCycle → closeCycle(id)', async () => {
    await controller.closeCycle(1);
    expect(mockSvc.closeCycle).toHaveBeenCalledWith(1);
  });

  it('reopenCycle → reopenCycle(id)', async () => {
    await controller.reopenCycle(1);
    expect(mockSvc.reopenCycle).toHaveBeenCalledWith(1);
  });

  it('remindCycle → remindCycleParticipants(id)', async () => {
    await controller.remindCycle(1);
    expect(mockSvc.remindCycleParticipants).toHaveBeenCalledWith(1);
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

  it('assign → assignEvaluator(dto, user)', async () => {
    const dto = {} as any;
    await controller.assign(dto, mockUser as any);
    expect(mockSvc.assignEvaluator).toHaveBeenCalledWith(dto, mockUser);
  });

  it('bulkAssign → bulkAssign(dto, user)', async () => {
    const dto = {} as any;
    await controller.bulkAssign(dto, mockUser as any);
    expect(mockSvc.bulkAssign).toHaveBeenCalledWith(dto, mockUser);
  });

  it('listRequests → getEvaluationRequestsList(filters)', async () => {
    const filters = {} as any;
    await controller.listRequests(filters);
    expect(mockSvc.getEvaluationRequestsList).toHaveBeenCalledWith(filters);
  });

  it('getRequestDetail → getEvaluationRequestDetail(id)', async () => {
    await controller.getRequestDetail(7);
    expect(mockSvc.getEvaluationRequestDetail).toHaveBeenCalledWith(7);
  });

  it('updateRequest → updateEvaluationRequest(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateRequest(7, dto);
    expect(mockSvc.updateEvaluationRequest).toHaveBeenCalledWith(7, dto);
  });

  it('remindRequest → remindEvaluationRequest(id)', async () => {
    await controller.remindRequest(7);
    expect(mockSvc.remindEvaluationRequest).toHaveBeenCalledWith(7);
  });

  it('finishRequest → finishEvaluationRequest(id)', async () => {
    await controller.finishRequest(7);
    expect(mockSvc.finishEvaluationRequest).toHaveBeenCalledWith(7);
  });

  it('reopenRequest → reopenEvaluationRequest(id)', async () => {
    await controller.reopenRequest(7);
    expect(mockSvc.reopenEvaluationRequest).toHaveBeenCalledWith(7);
  });

  it('advanceStage → advanceStage(id)', async () => {
    await controller.advanceStage(7);
    expect(mockSvc.advanceStage).toHaveBeenCalledWith(7);
  });

  // ponto 1 do doc — overview() ramifica para KPIs organizacionais só quando
  // o utilizador tem um dos MGMT_ROLES; caso contrário devolve o âmbito
  // pessoal (mesmo padrão de scoping usado no resto do controller).
  describe('overview — scoping por role', () => {
    it('ADMIN → getOverviewDashboard(userId, true)', async () => {
      await controller.overview(mockUser as any);
      expect(mockSvc.getOverviewDashboard).toHaveBeenCalledWith(1, true);
    });

    it('COLABORADOR → getOverviewDashboard(userId, false)', async () => {
      const colaborador = { id: 6, email: 'colab@innova.com', role: { name: 'COLABORADOR' } };
      await controller.overview(colaborador as any);
      expect(mockSvc.getOverviewDashboard).toHaveBeenCalledWith(6, false);
    });
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
    await controller.results(4, undefined, undefined, mockUser as any);
    expect(mockSvc.getResults).toHaveBeenCalledWith(4, undefined, undefined);
  });

  it('results com cycleId → getResults(userId, parsed)', async () => {
    await controller.results(4, '3', undefined, mockUser as any);
    expect(mockSvc.getResults).toHaveBeenCalledWith(4, 3, undefined);
  });

  it('results com period → getResults(userId, undefined, period)', async () => {
    await controller.results(4, undefined, '2026-03', mockUser as any);
    expect(mockSvc.getResults).toHaveBeenCalledWith(4, undefined, '2026-03');
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
      expect(() => controller.results(4, undefined, undefined, other as any)).toThrow();
      expect(mockSvc.getResults).not.toHaveBeenCalled();
    });

    it('colaborador pode ver os seus próprios results', async () => {
      await controller.results(4, undefined, undefined, owner as any);
      expect(mockSvc.getResults).toHaveBeenCalledWith(4, undefined, undefined);
    });

    it('LIDER pode ver results de qualquer colaborador', async () => {
      await controller.results(4, undefined, undefined, manager as any);
      expect(mockSvc.getResults).toHaveBeenCalledWith(4, undefined, undefined);
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
    expect(mockSvc.getCycleForCalibration).toHaveBeenCalledWith(2, undefined);
  });

  it('calibrationPanel com departmentId → getCycleForCalibration(cycleId, parsed)', async () => {
    await controller.calibrationPanel(2, '5');
    expect(mockSvc.getCycleForCalibration).toHaveBeenCalledWith(2, 5);
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
