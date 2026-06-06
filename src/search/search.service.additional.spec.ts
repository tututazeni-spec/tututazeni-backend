import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  user: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  course: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  document: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  knowledgeArticle: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  searchHistory: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  searchSuggestion: { findMany: jest.fn().mockResolvedValue([]) },
};

const baseUser = { id: 1, fullName: 'João Silva', email: 'joao@innova.com', avatarUrl: null, department: { name: 'TI' }, position: { name: 'Dev' } };
const baseCourse = { id: 1, title: 'TypeScript Avançado', description: 'Curso TS', category: 'TECH', status: 'PUBLISHED', thumbnailUrl: null, workloadHours: 20 };

describe('SearchService (additional)', () => {
  let service: SearchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SearchService>(SearchService);
  });

  // ─── globalSearch ─────────────────────────────────────────────

  describe('globalSearch', () => {
    it('deve retornar vazio para query com menos de 2 caracteres', async () => {
      const result = await service.globalSearch('a', 1);
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('deve pesquisar utilizadores e cursos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);
      mockPrisma.course.findMany.mockResolvedValue([baseCourse]);
      const result = await service.globalSearch('TypeScript', 1);
      expect(result).toBeDefined();
      expect(result.query).toBe('TypeScript');
    });

    it('deve filtrar por tipos específicos', async () => {
      mockPrisma.course.findMany.mockResolvedValue([baseCourse]);
      const result = await service.globalSearch('curso', 1, { types: ['course'] as any });
      expect(result).toBeDefined();
    });
  });

  // ─── typedSearch ─────────────────────────────────────────────

  describe('typedSearch', () => {
    it('deve pesquisar utilizadores especificamente', async () => {
      mockPrisma.user.findMany.mockResolvedValue([baseUser]);
      mockPrisma.user.count.mockResolvedValue(1);
      const result = await service.typedSearch('user' as any, 'João', 1, { page: 1, limit: 10 });
      expect(result).toBeDefined();
    });

    it('deve pesquisar cursos especificamente', async () => {
      mockPrisma.course.findMany.mockResolvedValue([baseCourse]);
      mockPrisma.course.count.mockResolvedValue(1);
      const result = await service.typedSearch('course' as any, 'TypeScript', 1, { page: 1, limit: 10 });
      expect(result).toBeDefined();
    });

    it('deve pesquisar documentos', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.document.count.mockResolvedValue(0);
      const result = await service.typedSearch('document' as any, 'contrato', 1, { page: 1, limit: 10 });
      expect(result).toBeDefined();
    });
  });

  // ─── getSuggestions ───────────────────────────────────────────

  describe('getSuggestions', () => {
    it('deve retornar sugestões de pesquisa', async () => {
      mockPrisma.searchSuggestion.findMany.mockResolvedValue([]);
      mockPrisma.course.findMany.mockResolvedValue([baseCourse]);
      const result = await service.getSuggestions('Type', 1);
      expect(result).toBeDefined();
    });

    it('deve retornar vazio para query muito curta', async () => {
      const result = await service.getSuggestions('T', 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getSearchHistory ─────────────────────────────────────────

  describe('getSearchHistory', () => {
    it('deve retornar histórico de pesquisa do utilizador', async () => {
      mockPrisma.searchHistory.findMany.mockResolvedValue([{ id: 1, query: 'TypeScript', userId: 1 }]);
      const result = await service.getSearchHistory(1);
      expect(result).toBeDefined();
    });
  });

  // ─── clearHistory ─────────────────────────────────────────────

  describe('clearHistory', () => {
    it('deve limpar histórico de pesquisa', async () => {
      mockPrisma.searchHistory.deleteMany = jest.fn().mockResolvedValue({ count: 5 });
      await service.clearHistory(1);
      expect(mockPrisma.searchHistory.deleteMany).toHaveBeenCalled();
    });
  });
});
