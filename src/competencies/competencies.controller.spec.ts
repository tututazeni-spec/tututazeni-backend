import { Test, TestingModule } from '@nestjs/testing';
import { CompetenciesController } from './competencies.controller';
import { CompetenciesService } from './competencies.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getTopCompetencies: jest.fn().mockResolvedValue([]),
  getSkillMatrix: jest.fn().mockResolvedValue([]),
  getOrgGapDashboard: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  archive: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
  createProficiencyLevel: jest.fn().mockResolvedValue({ id: 1 }),
  removeProficiencyLevel: jest.fn().mockResolvedValue({}),
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

  it('top sem limit → getTopCompetencies(10)', async () => {
    await controller.top();
    expect(mockSvc.getTopCompetencies).toHaveBeenCalledWith(10);
  });

  it('top com limit → getTopCompetencies(parsed)', async () => {
    await controller.top('5');
    expect(mockSvc.getTopCompetencies).toHaveBeenCalledWith(5);
  });

  it('skillMatrix sem params → getSkillMatrix(undefined, undefined)', async () => {
    await controller.skillMatrix();
    expect(mockSvc.getSkillMatrix).toHaveBeenCalledWith(undefined, undefined);
  });

  it('skillMatrix com params → getSkillMatrix(parsed, parsed)', async () => {
    await controller.skillMatrix('2', '3');
    expect(mockSvc.getSkillMatrix).toHaveBeenCalledWith(2, 3);
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

  it('createProficiencyLevel → createProficiencyLevel(dto)', async () => {
    const dto = {} as any;
    await controller.createProficiencyLevel(dto);
    expect(mockSvc.createProficiencyLevel).toHaveBeenCalledWith(dto);
  });

  it('removeProficiencyLevel → removeProficiencyLevel(levelId)', async () => {
    await controller.removeProficiencyLevel(5);
    expect(mockSvc.removeProficiencyLevel).toHaveBeenCalledWith(5);
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
