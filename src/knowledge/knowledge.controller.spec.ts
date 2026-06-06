import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  findAllCategories: jest.fn().mockResolvedValue([]),
  createCategory: jest.fn().mockResolvedValue({ id: 1 }),
  updateCategory: jest.fn().mockResolvedValue({ id: 1 }),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getTrending: jest.fn().mockResolvedValue([]),
  searchFullText: jest.fn().mockResolvedValue([]),
  getBookmarks: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getVersions: jest.fn().mockResolvedValue([]),
  getAcknowledgementReport: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({}),
  archive: jest.fn().mockResolvedValue({}),
  restoreVersion: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
  interact: jest.fn().mockResolvedValue({}),
  rateArticle: jest.fn().mockResolvedValue({}),
  acknowledgeArticle: jest.fn().mockResolvedValue({}),
  createComment: jest.fn().mockResolvedValue({ id: 1 }),
  deleteComment: jest.fn().mockResolvedValue({}),
  createQuestion: jest.fn().mockResolvedValue({ id: 1 }),
  answerQuestion: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('KnowledgeController', () => {
  let controller: KnowledgeController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeController],
      providers: [{ provide: KnowledgeService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<KnowledgeController>(KnowledgeController);
  });

  it('dashboard → getDashboard', async () => {
    await controller.dashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalled();
  });

  it('categories → findAllCategories', async () => {
    await controller.categories();
    expect(mockSvc.findAllCategories).toHaveBeenCalled();
  });

  it('createCategory → createCategory(dto)', async () => {
    const dto = {} as any;
    await controller.createCategory(dto);
    expect(mockSvc.createCategory).toHaveBeenCalledWith(dto);
  });

  it('updateCategory → updateCategory(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateCategory(1, dto);
    expect(mockSvc.updateCategory).toHaveBeenCalledWith(1, dto);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('trending sem limit → getTrending(10)', async () => {
    await controller.trending();
    expect(mockSvc.getTrending).toHaveBeenCalledWith(10);
  });

  it('trending com limit → getTrending(parsed)', async () => {
    await controller.trending('5');
    expect(mockSvc.getTrending).toHaveBeenCalledWith(5);
  });

  it('search → searchFullText(q, userId)', async () => {
    await controller.search('liderança', mockUser as any);
    expect(mockSvc.searchFullText).toHaveBeenCalledWith('liderança', 1);
  });

  it('myBookmarks → getBookmarks(userId)', async () => {
    await controller.myBookmarks(mockUser as any);
    expect(mockSvc.getBookmarks).toHaveBeenCalledWith(1);
  });

  it('findOne → findOne(id, userId)', async () => {
    await controller.findOne(3, mockUser as any);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3, 1);
  });

  it('versions → getVersions(id)', async () => {
    await controller.versions(2);
    expect(mockSvc.getVersions).toHaveBeenCalledWith(2);
  });

  it('acknowledgements → getAcknowledgementReport(id)', async () => {
    await controller.acknowledgements(4);
    expect(mockSvc.getAcknowledgementReport).toHaveBeenCalledWith(4);
  });

  it('create → create(userId, dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(1, dto);
  });

  it('update → update(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, mockUser as any, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto, 1);
  });

  it('publish → publish(id)', async () => {
    await controller.publish(1);
    expect(mockSvc.publish).toHaveBeenCalledWith(1);
  });

  it('archive → archive(id)', async () => {
    await controller.archive(1);
    expect(mockSvc.archive).toHaveBeenCalledWith(1);
  });

  it('restoreVersion → restoreVersion(id, versionId, userId)', async () => {
    await controller.restoreVersion(2, 5, mockUser as any);
    expect(mockSvc.restoreVersion).toHaveBeenCalledWith(2, 5, 1);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('interact → interact(userId, dto)', async () => {
    const dto = {} as any;
    await controller.interact(mockUser as any, dto);
    expect(mockSvc.interact).toHaveBeenCalledWith(1, dto);
  });

  it('rate → rateArticle(userId, dto)', async () => {
    const dto = {} as any;
    await controller.rate(mockUser as any, dto);
    expect(mockSvc.rateArticle).toHaveBeenCalledWith(1, dto);
  });

  it('acknowledge → acknowledgeArticle(userId, dto)', async () => {
    const dto = {} as any;
    await controller.acknowledge(mockUser as any, dto);
    expect(mockSvc.acknowledgeArticle).toHaveBeenCalledWith(1, dto);
  });

  it('createComment → createComment(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createComment(mockUser as any, dto);
    expect(mockSvc.createComment).toHaveBeenCalledWith(1, dto);
  });

  it('deleteComment → deleteComment(commentId, userId)', async () => {
    await controller.deleteComment(5, mockUser as any);
    expect(mockSvc.deleteComment).toHaveBeenCalledWith(5, 1);
  });

  it('createQuestion → createQuestion(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createQuestion(mockUser as any, dto);
    expect(mockSvc.createQuestion).toHaveBeenCalledWith(1, dto);
  });

  it('answerQuestion → answerQuestion(userId, dto)', async () => {
    const dto = {} as any;
    await controller.answerQuestion(mockUser as any, dto);
    expect(mockSvc.answerQuestion).toHaveBeenCalledWith(1, dto);
  });
});
