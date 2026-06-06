import { Test, TestingModule } from '@nestjs/testing';
import { CompetencyMapController } from './competency-map.controller';
import { CompetencyMapService } from './competency-map.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getHeatmapData: jest.fn().mockResolvedValue([]),
  getOrganisationalGapAnalysis: jest.fn().mockResolvedValue({}),
  getCategories: jest.fn().mockResolvedValue([]),
  createCategory: jest.fn().mockResolvedValue({ id: 1 }),
  getSkills: jest.fn().mockResolvedValue([]),
  getSkill: jest.fn().mockResolvedValue({ id: 1 }),
  createSkill: jest.fn().mockResolvedValue({ id: 2 }),
  updateSkill: jest.fn().mockResolvedValue({}),
  getProficiencyLevels: jest.fn().mockResolvedValue([]),
  setProficiencyLevels: jest.fn().mockResolvedValue({}),
  getAllRoleMatrices: jest.fn().mockResolvedValue([]),
  getRoleSkillMatrix: jest.fn().mockResolvedValue({}),
  setRoleSkillMatrix: jest.fn().mockResolvedValue({}),
  getMap: jest.fn().mockResolvedValue({}),
  getRadarData: jest.fn().mockResolvedValue([]),
  getUserGapAnalysis: jest.fn().mockResolvedValue({}),
  getSkillHistory: jest.fn().mockResolvedValue([]),
  getDepartmentMap: jest.fn().mockResolvedValue({}),
  getTeamMap: jest.fn().mockResolvedValue({}),
  upsertEmployeeSkill: jest.fn().mockResolvedValue({}),
  batchAssessment: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('CompetencyMapController', () => {
  let controller: CompetencyMapController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompetencyMapController],
      providers: [{ provide: CompetencyMapService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CompetencyMapController>(CompetencyMapController);
  });

  it('getHeatmap → getHeatmapData(department)', async () => {
    await controller.getHeatmap('IT');
    expect(mockSvc.getHeatmapData).toHaveBeenCalledWith('IT');
  });

  it('getOrganisationalGap → getOrganisationalGapAnalysis(filters)', async () => {
    const filters = {} as any;
    await controller.getOrganisationalGap(filters);
    expect(mockSvc.getOrganisationalGapAnalysis).toHaveBeenCalledWith(filters);
  });

  it('getCategories → getCategories', async () => {
    await controller.getCategories();
    expect(mockSvc.getCategories).toHaveBeenCalled();
  });

  it('createCategory → createCategory(dto)', async () => {
    const dto = {} as any;
    await controller.createCategory(dto);
    expect(mockSvc.createCategory).toHaveBeenCalledWith(dto);
  });

  it('getSkills → getSkills(filters)', async () => {
    const filters = {} as any;
    await controller.getSkills(filters);
    expect(mockSvc.getSkills).toHaveBeenCalledWith(filters);
  });

  it('getSkill → getSkill(id)', async () => {
    await controller.getSkill(3);
    expect(mockSvc.getSkill).toHaveBeenCalledWith(3);
  });

  it('createSkill → createSkill(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createSkill(dto, mockUser as any);
    expect(mockSvc.createSkill).toHaveBeenCalledWith(dto, 1);
  });

  it('updateSkill → updateSkill(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateSkill(1, dto);
    expect(mockSvc.updateSkill).toHaveBeenCalledWith(1, dto);
  });

  it('getProficiencyLevels → getProficiencyLevels(id)', async () => {
    await controller.getProficiencyLevels(2);
    expect(mockSvc.getProficiencyLevels).toHaveBeenCalledWith(2);
  });

  it('setProficiencyLevel → setProficiencyLevels(dto)', async () => {
    const dto = {} as any;
    await controller.setProficiencyLevel(dto);
    expect(mockSvc.setProficiencyLevels).toHaveBeenCalledWith(dto);
  });

  it('getAllRoleMatrices → getAllRoleMatrices(department)', async () => {
    await controller.getAllRoleMatrices('IT');
    expect(mockSvc.getAllRoleMatrices).toHaveBeenCalledWith('IT');
  });

  it('getRoleMatrix → getRoleSkillMatrix(roleCode)', async () => {
    await controller.getRoleMatrix('ADMIN');
    expect(mockSvc.getRoleSkillMatrix).toHaveBeenCalledWith('ADMIN');
  });

  it('setRoleMatrix → setRoleSkillMatrix(dto)', async () => {
    const dto = {} as any;
    await controller.setRoleMatrix(dto);
    expect(mockSvc.setRoleSkillMatrix).toHaveBeenCalledWith(dto);
  });

  it('myMap → getMap(userId)', async () => {
    await controller.myMap(mockUser as any);
    expect(mockSvc.getMap).toHaveBeenCalledWith(1);
  });

  it('myRadar → getRadarData(userId)', async () => {
    await controller.myRadar(mockUser as any);
    expect(mockSvc.getRadarData).toHaveBeenCalledWith(1);
  });

  it('myGap → getUserGapAnalysis(userId, roleCode)', async () => {
    await controller.myGap(mockUser as any, 'RH');
    expect(mockSvc.getUserGapAnalysis).toHaveBeenCalledWith(1, 'RH');
  });

  it('mySkillHistory → getSkillHistory(userId, skillId)', async () => {
    await controller.mySkillHistory(mockUser as any, 5);
    expect(mockSvc.getSkillHistory).toHaveBeenCalledWith(1, 5);
  });

  it('userMap → getMap(id)', async () => {
    await controller.userMap(3);
    expect(mockSvc.getMap).toHaveBeenCalledWith(3);
  });

  it('userGap → getUserGapAnalysis(id)', async () => {
    await controller.userGap(4);
    expect(mockSvc.getUserGapAnalysis).toHaveBeenCalledWith(4, undefined);
  });

  it('userRadar → getRadarData(id)', async () => {
    await controller.userRadar(5);
    expect(mockSvc.getRadarData).toHaveBeenCalledWith(5);
  });

  it('deptMap → getDepartmentMap(dept)', async () => {
    await controller.deptMap('IT');
    expect(mockSvc.getDepartmentMap).toHaveBeenCalledWith('IT');
  });

  it('teamMap → getTeamMap(userId)', async () => {
    await controller.teamMap(mockUser as any);
    expect(mockSvc.getTeamMap).toHaveBeenCalledWith(1);
  });

  it('assess → upsertEmployeeSkill(dto, userId)', async () => {
    const dto = {} as any;
    await controller.assess(dto, mockUser as any);
    expect(mockSvc.upsertEmployeeSkill).toHaveBeenCalledWith(dto, 1);
  });

  it('batchAssess → batchAssessment(dto, userId)', async () => {
    const dto = {} as any;
    await controller.batchAssess(dto, mockUser as any);
    expect(mockSvc.batchAssessment).toHaveBeenCalledWith(dto, 1);
  });
});
