import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SearchEntityType } from './search.dto';

const mockSvc = {
  globalSearch: jest.fn().mockResolvedValue({ results: [], total: 0 }),
  searchByType: jest.fn().mockResolvedValue({ results: [], total: 0 }),
  autocomplete: jest.fn().mockResolvedValue([]),
  getSuggestions: jest.fn().mockResolvedValue({}),
  getHistory: jest.fn().mockResolvedValue([]),
  clearHistory: jest.fn().mockResolvedValue({}),
  getAnalytics: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<SearchController>(SearchController);
  });

  it('globalSearch → globalSearch(q, userId, dto)', async () => {
    const dto = { q: 'test' } as any;
    await controller.globalSearch(dto, mockUser as any);
    expect(mockSvc.globalSearch).toHaveBeenCalledWith('test', 1, dto);
  });

  it('users → searchByType(USER, q, userId, dto)', async () => {
    const dto = { q: 'john' } as any;
    await controller.users(dto, mockUser as any);
    expect(mockSvc.searchByType).toHaveBeenCalledWith(SearchEntityType.USER, 'john', 1, dto);
  });

  it('courses → searchByType(COURSE, q, userId, dto)', async () => {
    const dto = { q: 'excel' } as any;
    await controller.courses(dto, mockUser as any);
    expect(mockSvc.searchByType).toHaveBeenCalledWith(SearchEntityType.COURSE, 'excel', 1, dto);
  });

  it('content → searchByType(CONTENT, q, userId, dto)', async () => {
    const dto = { q: 'video' } as any;
    await controller.content(dto, mockUser as any);
    expect(mockSvc.searchByType).toHaveBeenCalledWith(SearchEntityType.CONTENT, 'video', 1, dto);
  });

  it('documents → searchByType(DOCUMENT, q, userId, dto)', async () => {
    const dto = { q: 'manual' } as any;
    await controller.documents(dto, mockUser as any);
    expect(mockSvc.searchByType).toHaveBeenCalledWith(SearchEntityType.DOCUMENT, 'manual', 1, dto);
  });

  it('pdis → searchByType(PDI, q, userId, dto)', async () => {
    const dto = { q: 'liderança' } as any;
    await controller.pdis(dto, mockUser as any);
    expect(mockSvc.searchByType).toHaveBeenCalledWith(SearchEntityType.PDI, 'liderança', 1, dto);
  });

  it('competencies → searchByType(COMPETENCY, q, userId, dto)', async () => {
    const dto = { q: 'comunicação' } as any;
    await controller.competencies(dto, mockUser as any);
    expect(mockSvc.searchByType).toHaveBeenCalledWith(SearchEntityType.COMPETENCY, 'comunicação', 1, dto);
  });

  it('scenarios → searchByType(SCENARIO, q, userId, dto)', async () => {
    const dto = { q: 'atendimento' } as any;
    await controller.scenarios(dto, mockUser as any);
    expect(mockSvc.searchByType).toHaveBeenCalledWith(SearchEntityType.SCENARIO, 'atendimento', 1, dto);
  });

  it('autocomplete → autocomplete(q, userId, 5)', async () => {
    const dto = { q: 'jo' } as any;
    await controller.autocomplete(dto, mockUser as any);
    expect(mockSvc.autocomplete).toHaveBeenCalledWith('jo', 1, 5);
  });

  it('suggestions → getSuggestions(userId)', async () => {
    await controller.suggestions(mockUser as any);
    expect(mockSvc.getSuggestions).toHaveBeenCalledWith(1);
  });

  it('history sem limit → getHistory(userId, 20)', async () => {
    await controller.history(mockUser as any);
    expect(mockSvc.getHistory).toHaveBeenCalledWith(1, 20);
  });

  it('history com limit → getHistory(userId, parsed)', async () => {
    await controller.history(mockUser as any, '10');
    expect(mockSvc.getHistory).toHaveBeenCalledWith(1, 10);
  });

  it('clearHistory → clearHistory(userId)', async () => {
    await controller.clearHistory(mockUser as any);
    expect(mockSvc.clearHistory).toHaveBeenCalledWith(1);
  });

  it('analytics → getAnalytics', async () => {
    await controller.analytics();
    expect(mockSvc.getAnalytics).toHaveBeenCalled();
  });
});
