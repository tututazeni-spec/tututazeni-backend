import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = new Proxy({
  user: { findMany: jest.fn().mockResolvedValue([]) },
  enrollment: { findMany: jest.fn().mockResolvedValue([]) },
  contentAsset: { findMany: jest.fn().mockResolvedValue([]) },
  developmentPlan: { findMany: jest.fn().mockResolvedValue([]) },
  competency: { findMany: jest.fn().mockResolvedValue([]) },
}, {
  get(target, prop) {
    return (target as any)[prop] ?? { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) };
  },
});

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SearchService>(SearchService);
  });

  describe('globalSearch', () => {
    it('deve retornar resultados de busca global', async () => {
      const result = await service.globalSearch('test', 1, {});
      expect(result).toBeDefined();
    });

    it('deve retornar resultados vazios', async () => {
      const result = await service.globalSearch('', 1, {});
      expect(result).toBeDefined();
    });
  });
});
