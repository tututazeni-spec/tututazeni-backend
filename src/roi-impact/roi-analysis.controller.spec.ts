import { Test, TestingModule } from '@nestjs/testing';
import { RoiAnalysisController } from './roi-analysis.controller';
import { RoiAnalysisService } from './roi-analysis.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RoiInitiativeType, RoiAnalysisStatus } from './roi-impact.dto';
import type { CurrentUserData } from '../common/types/current-user';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ total: 0, analyses: [] }),
  listInitiativeOptions: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  computeResult: jest.fn().mockResolvedValue({}),
  approve: jest.fn().mockResolvedValue({}),
};

const user: CurrentUserData = {
  id: 42,
  email: 'rh@innova.test',
  active: true,
  roleId: 1,
  role: null,
};

describe('RoiAnalysisController', () => {
  let controller: RoiAnalysisController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoiAnalysisController],
      providers: [{ provide: RoiAnalysisService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<RoiAnalysisController>(RoiAnalysisController);
  });

  it('findAll → svc.findAll(filter)', async () => {
    await controller.findAll({ status: RoiAnalysisStatus.CALCULADO });
    expect(mockSvc.findAll).toHaveBeenCalledWith({ status: RoiAnalysisStatus.CALCULADO });
  });

  it('initiativeOptions → svc.listInitiativeOptions(type)', async () => {
    await controller.initiativeOptions(RoiInitiativeType.CURSO);
    expect(mockSvc.listInitiativeOptions).toHaveBeenCalledWith(RoiInitiativeType.CURSO);
  });

  it('findOne → svc.findOne(id)', async () => {
    await controller.findOne(7);
    expect(mockSvc.findOne).toHaveBeenCalledWith(7);
  });

  it('create → svc.create(dto, user.id)', async () => {
    const dto = { name: 'X', initiativeType: RoiInitiativeType.CURSO };
    await controller.create(dto, user);
    expect(mockSvc.create).toHaveBeenCalledWith(dto, 42);
  });

  it('update → svc.update(id, dto)', async () => {
    const dto = { costDirect: 100 };
    await controller.update(7, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(7, dto);
  });

  it('compute → svc.computeResult(id, dto)', async () => {
    const dto = { monetaryBenefitOverride: 500 };
    await controller.compute(7, dto);
    expect(mockSvc.computeResult).toHaveBeenCalledWith(7, dto);
  });

  it('approve → svc.approve(id, dto)', async () => {
    const dto = { status: RoiAnalysisStatus.VALIDADO, approvedById: 1 };
    await controller.approve(7, dto);
    expect(mockSvc.approve).toHaveBeenCalledWith(7, dto);
  });
});
