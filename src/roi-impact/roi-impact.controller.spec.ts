import { Test, TestingModule } from '@nestjs/testing';
import { RoiImpactController } from './roi-impact.controller';
import { RoiImpactService } from './roi-impact.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  calculateTrainingRoi: jest.fn().mockResolvedValue({}),
  calculateRoiFull: jest.fn().mockResolvedValue({}),
  getImpactMetrics: jest.fn().mockResolvedValue({}),
  getRetentionImpact: jest.fn().mockResolvedValue({}),
  getPerformanceImpact: jest.fn().mockResolvedValue({}),
  getLearningImpact: jest.fn().mockResolvedValue({}),
  getExecutiveDashboard: jest.fn().mockResolvedValue({}),
  getProgramLibrary: jest.fn().mockResolvedValue([]),
  simulateWhatIf: jest.fn().mockResolvedValue({}),
};

describe('RoiImpactController', () => {
  let controller: RoiImpactController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoiImpactController],
      providers: [{ provide: RoiImpactService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<RoiImpactController>(RoiImpactController);
  });

  it('trainingRoi → calculateTrainingRoi(from, to)', async () => {
    await controller.trainingRoi('2024-01', '2024-12');
    expect(mockSvc.calculateTrainingRoi).toHaveBeenCalledWith('2024-01', '2024-12');
  });

  it('calculate → calculateRoiFull(filter, dto)', async () => {
    const dto = { from: '2024-01', to: '2024-12' } as any;
    await controller.calculate(dto);
    expect(mockSvc.calculateRoiFull).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2024-01', to: '2024-12' }),
      dto,
    );
  });

  it('impactMetrics → getImpactMetrics()', async () => {
    await controller.impactMetrics();
    expect(mockSvc.getImpactMetrics).toHaveBeenCalled();
  });

  it('impactLevels → getImpactMetrics(filter)', async () => {
    const filter = {} as any;
    await controller.impactLevels(filter);
    expect(mockSvc.getImpactMetrics).toHaveBeenCalledWith(filter);
  });

  it('retentionImpact → getRetentionImpact(filter)', async () => {
    const filter = {} as any;
    await controller.retentionImpact(filter);
    expect(mockSvc.getRetentionImpact).toHaveBeenCalledWith(filter);
  });

  it('performanceImpact → getPerformanceImpact(filter)', async () => {
    const filter = {} as any;
    await controller.performanceImpact(filter);
    expect(mockSvc.getPerformanceImpact).toHaveBeenCalledWith(filter);
  });

  it('learningImpact → getLearningImpact(filter)', async () => {
    const filter = {} as any;
    await controller.learningImpact(filter);
    expect(mockSvc.getLearningImpact).toHaveBeenCalledWith(filter);
  });

  it('executive → getExecutiveDashboard(filter)', async () => {
    const filter = {} as any;
    await controller.executive(filter);
    expect(mockSvc.getExecutiveDashboard).toHaveBeenCalledWith(filter);
  });

  it('programs → getProgramLibrary(filter)', async () => {
    const filter = {} as any;
    await controller.programs(filter);
    expect(mockSvc.getProgramLibrary).toHaveBeenCalledWith(filter);
  });

  it('simulate → simulateWhatIf(dto)', async () => {
    const dto = {} as any;
    await controller.simulate(dto);
    expect(mockSvc.simulateWhatIf).toHaveBeenCalledWith(dto);
  });
});
