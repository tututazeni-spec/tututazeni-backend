import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DocumentRepositoryService } from './document-repository.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockPrisma = {
  docCategoryModel: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  document: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
  },
  docPermission: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  docAuditLog: { create: jest.fn().mockResolvedValue({}) },
  docShareLink: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  docDownload: { create: jest.fn().mockResolvedValue({}) },
  docVersion: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseDoc = {
  id: 1,
  title: 'Regulamento',
  type: 'POLICY',
  status: 'PUBLISHED',
  category: null,
  permissions: [],
  _count: { downloads: 5 },
};

describe('DocumentRepositoryService', () => {
  let service: DocumentRepositoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentRepositoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();
    service = module.get<DocumentRepositoryService>(DocumentRepositoryService);
  });

  describe('getCategories', () => {
    it('deve retornar categorias', async () => {
      mockPrisma.docCategoryModel.findMany.mockResolvedValue([{ id: 1, name: 'Políticas' }]);
      const result = await service.getCategories();
      expect(result).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('deve retornar documentos paginados', async () => {
      mockPrisma.document.findMany.mockResolvedValue([baseDoc]);
      mockPrisma.document.count.mockResolvedValue(1);
      const result = await service.findAll({}, 1);
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar documento por id', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(baseDoc);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar documento', async () => {
      mockPrisma.document.create.mockResolvedValue(baseDoc);
      const result = await service.create(1, { title: 'Regulamento', type: 'POLICY' } as any);
      expect(result).toBeDefined();
    });
  });
});
