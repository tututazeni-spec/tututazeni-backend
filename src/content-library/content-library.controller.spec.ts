import { Test, TestingModule } from '@nestjs/testing';
import { ContentLibraryController } from './content-library.controller';
import { ContentLibraryService } from './content-library.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getTrending: jest.fn().mockResolvedValue([]),
  getNewContent: jest.fn().mockResolvedValue([]),
  getRecommended: jest.fn().mockResolvedValue([]),
  getMandatory: jest.fn().mockResolvedValue([]),
  getMyBookmarks: jest.fn().mockResolvedValue([]),
  getContinueWatching: jest.fn().mockResolvedValue([]),
  getCategoryBreakdown: jest.fn().mockResolvedValue([]),
  getAllTags: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({}),
  deprecate: jest.fn().mockResolvedValue({}),
  view: jest.fn().mockResolvedValue({}),
  bookmark: jest.fn().mockResolvedValue({}),
  updateProgress: jest.fn().mockResolvedValue({}),
  getMyProgress: jest.fn().mockResolvedValue({}),
  rateContent: jest.fn().mockResolvedValue({}),
  getContentRatings: jest.fn().mockResolvedValue({}),
  saveNote: jest.fn().mockResolvedValue({}),
  getMyNote: jest.fn().mockResolvedValue({}),
  getLearningPaths: jest.fn().mockResolvedValue([]),
  getLearningPath: jest.fn().mockResolvedValue({ id: 1 }),
  createLearningPath: jest.fn().mockResolvedValue({ id: 1 }),
  enrollLearningPath: jest.fn().mockResolvedValue({}),
  getAnalyticsDashboard: jest.fn().mockResolvedValue({}),
  getUserAnalytics: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('ContentLibraryController', () => {
  let controller: ContentLibraryController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentLibraryController],
      providers: [{ provide: ContentLibraryService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ContentLibraryController>(ContentLibraryController);
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

  it('newContent → getNewContent(10)', async () => {
    await controller.newContent();
    expect(mockSvc.getNewContent).toHaveBeenCalledWith(10);
  });

  it('recommended → getRecommended(userId, 10)', async () => {
    await controller.recommended(mockUser as any);
    expect(mockSvc.getRecommended).toHaveBeenCalledWith(1, 10);
  });

  it('mandatory → getMandatory(userId)', async () => {
    await controller.mandatory(mockUser as any);
    expect(mockSvc.getMandatory).toHaveBeenCalledWith(1);
  });

  it('bookmarks → getMyBookmarks(userId)', async () => {
    await controller.bookmarks(mockUser as any);
    expect(mockSvc.getMyBookmarks).toHaveBeenCalledWith(1);
  });

  it('continueWatching → getContinueWatching(userId, 5)', async () => {
    await controller.continueWatching(mockUser as any);
    expect(mockSvc.getContinueWatching).toHaveBeenCalledWith(1, 5);
  });

  it('categories → getCategoryBreakdown', async () => {
    await controller.categories();
    expect(mockSvc.getCategoryBreakdown).toHaveBeenCalled();
  });

  it('tags → getAllTags', async () => {
    await controller.tags();
    expect(mockSvc.getAllTags).toHaveBeenCalled();
  });

  it('findOne → findOne(id, userId)', async () => {
    await controller.findOne(3, mockUser as any);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3, 1);
  });

  it('create → create(userId, dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(1, dto);
  });

  it('update → update(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.update(1, dto, mockUser as any);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto, 1);
  });

  it('publish → publish(id, userId)', async () => {
    await controller.publish(1, mockUser as any);
    expect(mockSvc.publish).toHaveBeenCalledWith(1, 1);
  });

  it('deprecate → deprecate(id)', async () => {
    await controller.deprecate(2);
    expect(mockSvc.deprecate).toHaveBeenCalledWith(2);
  });

  it('view → view(id, userId)', async () => {
    await controller.view(3, mockUser as any);
    expect(mockSvc.view).toHaveBeenCalledWith(3, 1);
  });

  it('bookmark → bookmark(id, userId)', async () => {
    await controller.bookmark(4, mockUser as any);
    expect(mockSvc.bookmark).toHaveBeenCalledWith(4, 1);
  });

  it('updateProgress → updateProgress(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.updateProgress(5, dto, mockUser as any);
    expect(mockSvc.updateProgress).toHaveBeenCalledWith(5, 1, dto);
  });

  it('myProgress → getMyProgress(userId)', async () => {
    await controller.myProgress(mockUser as any);
    expect(mockSvc.getMyProgress).toHaveBeenCalledWith(1);
  });

  it('rate → rateContent(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.rate(2, dto, mockUser as any);
    expect(mockSvc.rateContent).toHaveBeenCalledWith(2, 1, dto);
  });

  it('ratings → getContentRatings(id)', async () => {
    await controller.ratings(3);
    expect(mockSvc.getContentRatings).toHaveBeenCalledWith(3);
  });

  it('saveNote → saveNote(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.saveNote(4, dto, mockUser as any);
    expect(mockSvc.saveNote).toHaveBeenCalledWith(4, 1, dto);
  });

  it('getNote → getMyNote(id, userId)', async () => {
    await controller.getNote(5, mockUser as any);
    expect(mockSvc.getMyNote).toHaveBeenCalledWith(5, 1);
  });

  it('getLearningPaths → getLearningPaths(filters)', async () => {
    const filters = {} as any;
    await controller.getLearningPaths(filters);
    expect(mockSvc.getLearningPaths).toHaveBeenCalledWith(filters);
  });

  it('getLearningPath → getLearningPath(id, userId)', async () => {
    await controller.getLearningPath(2, mockUser as any);
    expect(mockSvc.getLearningPath).toHaveBeenCalledWith(2, 1);
  });

  it('createLearningPath → createLearningPath(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createLearningPath(dto, mockUser as any);
    expect(mockSvc.createLearningPath).toHaveBeenCalledWith(dto, 1);
  });

  it('enrollPath → enrollLearningPath(id, userId)', async () => {
    await controller.enrollPath(3, mockUser as any);
    expect(mockSvc.enrollLearningPath).toHaveBeenCalledWith(3, 1);
  });

  it('analyticsDashboard sem deptId → getAnalyticsDashboard(undefined)', async () => {
    await controller.analyticsDashboard();
    expect(mockSvc.getAnalyticsDashboard).toHaveBeenCalledWith(undefined);
  });

  it('myStats → getUserAnalytics(userId)', async () => {
    await controller.myStats(mockUser as any);
    expect(mockSvc.getUserAnalytics).toHaveBeenCalledWith(1);
  });
});
