import { Test, TestingModule } from '@nestjs/testing';
import { CompetenciesController } from './competencies.controller';
import { CompetenciesService } from './competencies.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getOverview: jest.fn().mockResolvedValue({}),
  getTopCompetencies: jest.fn().mockResolvedValue([]),
  getSkillMatrix: jest.fn().mockResolvedValue([]),
  getEvaluations: jest.fn().mockResolvedValue([]),
  getGaps: jest.fn().mockResolvedValue([]),
  getDevelopmentActions: jest.fn().mockResolvedValue([]),
  getOrgGapDashboard: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  archive: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
  findAllProficiencyLevels: jest.fn().mockResolvedValue([]),
  createProficiencyLevel: jest.fn().mockResolvedValue({ id: 1 }),
  updateProficiencyLevel: jest.fn().mockResolvedValue({ id: 1 }),
  removeProficiencyLevel: jest.fn().mockResolvedValue({}),
  findAllModels: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findOneModel: jest.fn().mockResolvedValue({ id: 1 }),
  createModel: jest.fn().mockResolvedValue({ id: 1 }),
  updateModel: jest.fn().mockResolvedValue({ id: 1 }),
  removeModel: jest.fn().mockResolvedValue({}),
  upsertModelItem: jest.fn().mockResolvedValue({ id: 1 }),
  removeModelItem: jest.fn().mockResolvedValue({}),
  mapToPosition: jest.fn().mockResolvedValue({}),
  unmapFromPosition: jest.fn().mockResolvedValue({}),
  mapToCourse: jest.fn().mockResolvedValue({}),
  getUserCompetencies: jest.fn().mockResolvedValue([]),
  getCompetencyGap: jest.fn().mockResolvedValue({}),
  getRecommendations: jest.fn().mockResolvedValue([]),
  getCompetencyEvolution: jest.fn().mockResolvedValue([]),
  selfAssess: jest.fn().mockResolvedValue({}),
  getEndorsements: jest.fn().mockResolvedValue([]),
  upsertUserCompetency: jest.fn().mockResolvedValue({}),
  managerAssess: jest.fn().mockResolvedValue({}),
  addEndorsement: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('CompetenciesController', () => {
  let controller: CompetenciesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompetenciesController],
      providers: [{ provide: CompetenciesService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CompetenciesController>(CompetenciesController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('overview → getOverview()', async () => {
    await controller.overview();
    expect(mockSvc.getOverview).toHaveBeenCalledWith();
  });

  it('top sem limit → getTopCompetencies(10)', async () => {
    await controller.top();
    expect(mockSvc.getTopCompetencies).toHaveBeenCalledWith(10);
  });

  it('top com limit → getTopCompetencies(parsed)', async () => {
    await controller.top('5');
    expect(mockSvc.getTopCompetencies).toHaveBeenCalledWith(5);
  });

  it('skillMatrix sem filtros → getSkillMatrix({})', async () => {
    await controller.skillMatrix({});
    expect(mockSvc.getSkillMatrix).toHaveBeenCalledWith({});
  });

  it('skillMatrix com filtros → getSkillMatrix(filters)', async () => {
    const filters = { departmentId: 2, positionId: 3, competencyId: 7 };
    await controller.skillMatrix(filters);
    expect(mockSvc.getSkillMatrix).toHaveBeenCalledWith(filters);
  });

  it('evaluations sem filtros → getEvaluations({})', async () => {
    await controller.evaluations({});
    expect(mockSvc.getEvaluations).toHaveBeenCalledWith({});
  });

  it('gaps sem filtros → getGaps({})', async () => {
    await controller.gaps({});
    expect(mockSvc.getGaps).toHaveBeenCalledWith({});
  });

  it('gaps com filtros → getGaps(filters)', async () => {
    const filters = { departmentId: 2, priority: 'HIGH' as any };
    await controller.gaps(filters);
    expect(mockSvc.getGaps).toHaveBeenCalledWith(filters);
  });

  it('development sem filtros → getDevelopmentActions({})', async () => {
    await controller.development({});
    expect(mockSvc.getDevelopmentActions).toHaveBeenCalledWith({});
  });

  it('development com filtros → getDevelopmentActions(filters)', async () => {
    const filters = { userId: 5, type: 'COURSE' as any };
    await controller.development(filters);
    expect(mockSvc.getDevelopmentActions).toHaveBeenCalledWith(filters);
  });

  it('orgGapDashboard sem departmentId → getOrgGapDashboard(undefined)', async () => {
    await controller.orgGapDashboard();
    expect(mockSvc.getOrgGapDashboard).toHaveBeenCalledWith(undefined);
  });

  it('orgGapDashboard com departmentId → getOrgGapDashboard(parsed)', async () => {
    await controller.orgGapDashboard('4');
    expect(mockSvc.getOrgGapDashboard).toHaveBeenCalledWith(4);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(3);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });

  it('archive → archive(id)', async () => {
    await controller.archive(1);
    expect(mockSvc.archive).toHaveBeenCalledWith(1);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('findAllProficiencyLevels sem params → findAllProficiencyLevels(undefined, undefined)', async () => {
    await controller.findAllProficiencyLevels();
    expect(mockSvc.findAllProficiencyLevels).toHaveBeenCalledWith({
      competencyId: undefined,
      search: undefined,
    });
  });

  it('findAllProficiencyLevels com params → findAllProficiencyLevels(parsed)', async () => {
    await controller.findAllProficiencyLevels('2', 'lide');
    expect(mockSvc.findAllProficiencyLevels).toHaveBeenCalledWith({
      competencyId: 2,
      search: 'lide',
    });
  });

  it('createProficiencyLevel → createProficiencyLevel(dto)', async () => {
    const dto = {} as any;
    await controller.createProficiencyLevel(dto);
    expect(mockSvc.createProficiencyLevel).toHaveBeenCalledWith(dto);
  });

  it('updateProficiencyLevel → updateProficiencyLevel(levelId, dto)', async () => {
    const dto = {} as any;
    await controller.updateProficiencyLevel(5, dto);
    expect(mockSvc.updateProficiencyLevel).toHaveBeenCalledWith(5, dto);
  });

  it('removeProficiencyLevel → removeProficiencyLevel(levelId)', async () => {
    await controller.removeProficiencyLevel(5);
    expect(mockSvc.removeProficiencyLevel).toHaveBeenCalledWith(5);
  });

  it('findAllModels → findAllModels(filters)', async () => {
    const filters = {} as any;
    await controller.findAllModels(filters);
    expect(mockSvc.findAllModels).toHaveBeenCalledWith(filters);
  });

  it('createModel → createModel(dto)', async () => {
    const dto = {} as any;
    await controller.createModel(dto);
    expect(mockSvc.createModel).toHaveBeenCalledWith(dto);
  });

  it('findOneModel → findOneModel(id)', async () => {
    await controller.findOneModel(1);
    expect(mockSvc.findOneModel).toHaveBeenCalledWith(1);
  });

  it('updateModel → updateModel(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateModel(1, dto);
    expect(mockSvc.updateModel).toHaveBeenCalledWith(1, dto);
  });

  it('removeModel → removeModel(id)', async () => {
    await controller.removeModel(1);
    expect(mockSvc.removeModel).toHaveBeenCalledWith(1);
  });

  it('upsertModelItem → upsertModelItem(id, dto)', async () => {
    const dto = {} as any;
    await controller.upsertModelItem(1, dto);
    expect(mockSvc.upsertModelItem).toHaveBeenCalledWith(1, dto);
  });

  it('removeModelItem → removeModelItem(id, competencyId)', async () => {
    await controller.removeModelItem(1, 2);
    expect(mockSvc.removeModelItem).toHaveBeenCalledWith(1, 2);
  });

  it('mapToPosition → mapToPosition(dto)', async () => {
    const dto = {} as any;
    await controller.mapToPosition(dto);
    expect(mockSvc.mapToPosition).toHaveBeenCalledWith(dto);
  });

  it('unmapFromPosition → unmapFromPosition(positionId, competencyId)', async () => {
    await controller.unmapFromPosition(2, 3);
    expect(mockSvc.unmapFromPosition).toHaveBeenCalledWith(2, 3);
  });

  it('mapToCourse → mapToCourse(dto)', async () => {
    const dto = {} as any;
    await controller.mapToCourse(dto);
    expect(mockSvc.mapToCourse).toHaveBeenCalledWith(dto);
  });

  it('myCompetencies → getUserCompetencies(userId)', async () => {
    await controller.myCompetencies(mockUser as any);
    expect(mockSvc.getUserCompetencies).toHaveBeenCalledWith(1);
  });

  it('myGap → getCompetencyGap(userId, positionId)', async () => {
    await controller.myGap(mockUser as any, 3);
    expect(mockSvc.getCompetencyGap).toHaveBeenCalledWith(1, 3);
  });

  it('myRecommendations → getRecommendations(userId)', async () => {
    await controller.myRecommendations(mockUser as any);
    expect(mockSvc.getRecommendations).toHaveBeenCalledWith(1);
  });

  it('myEvolution sem competencyId → getCompetencyEvolution(userId, undefined)', async () => {
    await controller.myEvolution(mockUser as any);
    expect(mockSvc.getCompetencyEvolution).toHaveBeenCalledWith(1, undefined);
  });

  it('myEvolution com competencyId → getCompetencyEvolution(userId, parsed)', async () => {
    await controller.myEvolution(mockUser as any, '5');
    expect(mockSvc.getCompetencyEvolution).toHaveBeenCalledWith(1, 5);
  });

  it('selfAssess → selfAssess(userId, dto)', async () => {
    const dto = {} as any;
    await controller.selfAssess(mockUser as any, dto);
    expect(mockSvc.selfAssess).toHaveBeenCalledWith(1, dto);
  });

  it('myEndorsements → getEndorsements(userId)', async () => {
    await controller.myEndorsements(mockUser as any);
    expect(mockSvc.getEndorsements).toHaveBeenCalledWith(1);
  });

  it('userCompetencies → getUserCompetencies(userId)', async () => {
    await controller.userCompetencies(3);
    expect(mockSvc.getUserCompetencies).toHaveBeenCalledWith(3);
  });

  it('gapAnalysis → getCompetencyGap(userId, positionId)', async () => {
    await controller.gapAnalysis(2, 4);
    expect(mockSvc.getCompetencyGap).toHaveBeenCalledWith(2, 4);
  });

  it('userEvolution → getCompetencyEvolution(userId)', async () => {
    await controller.userEvolution(3);
    expect(mockSvc.getCompetencyEvolution).toHaveBeenCalledWith(3, undefined);
  });

  it('userEndorsements → getEndorsements(userId)', async () => {
    await controller.userEndorsements(4);
    expect(mockSvc.getEndorsements).toHaveBeenCalledWith(4);
  });

  it('upsertUser → upsertUserCompetency(dto, updaterId)', async () => {
    const dto = {} as any;
    await controller.upsertUser(mockUser as any, dto);
    expect(mockSvc.upsertUserCompetency).toHaveBeenCalledWith(dto, 1);
  });

  it('managerAssess → managerAssess(managerId, dto)', async () => {
    const dto = {} as any;
    await controller.managerAssess(mockUser as any, dto);
    expect(mockSvc.managerAssess).toHaveBeenCalledWith(1, dto);
  });

  it('endorse → addEndorsement(userId, dto)', async () => {
    const dto = {} as any;
    await controller.endorse(mockUser as any, dto);
    expect(mockSvc.addEndorsement).toHaveBeenCalledWith(1, dto);
  });
});
