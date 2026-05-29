import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContentLibraryService } from './content-library.service';
import { PrismaService } from '../prisma/prisma.service';

const makeFind = (data: any[] = []) => jest.fn().mockResolvedValue(data);
const makeCount = (n = 0) => jest.fn().mockResolvedValue(n);

const mockPrisma = {
  contentAsset: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: makeFind(),
    create: jest.fn(),
    update: jest.fn(),
    count: makeCount(),
    delete: jest.fn(),
    aggregate: jest.fn().mockResolvedValue({ _sum: { views: 0 } }),
  },
  user: { findUnique: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    findMany: jest.fn().mockResolvedValue([]),
  },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const baseAsset = {
  id: 1,
  title: 'Manual NestJS',
  type: 'DOCUMENT',
  status: 'PUBLISHED',
  category: 'Tech',
  tags: [],
  _count: { views: 10 },
};

describe('ContentLibraryService', () => {
  let service: ContentLibraryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentLibraryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ContentLibraryService>(ContentLibraryService);
  });

  describe('findAll', () => {
    it('deve retornar assets paginados', async () => {
      mockPrisma.contentAsset.findMany.mockResolvedValue([baseAsset]);
      mockPrisma.contentAsset.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar asset por id', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(baseAsset);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.contentAsset.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar asset', async () => {
      mockPrisma.contentAsset.findFirst.mockResolvedValue(null);
      mockPrisma.contentAsset.create.mockResolvedValue(baseAsset);
      const result = await service.create(1, { title: 'Manual NestJS', type: 'DOCUMENT' } as any);
      expect(result).toBeDefined();
    });
  });
});
