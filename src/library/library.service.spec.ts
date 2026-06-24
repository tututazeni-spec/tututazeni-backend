import { Test, TestingModule } from '@nestjs/testing';
import { LibraryService } from './library.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/services/audit.service';

const mockItem = {
  id: 'item-1',
  code: 'LIB-00001',
  title: 'Manual de Segurança',
  type: 'PDF',
  fileUrl: 'https://storage/manual.pdf',
  views: 0,
  downloads: 0,
  rating: 0,
  ratingCount: 0,
  isApproved: false,
  deletedAt: null,
  collection: { name: 'Manuais' },
  uploadedBy: { fullName: 'Admin' },
  reviewedBy: null,
  comments: [],
  ratings: [],
  _count: { comments: 0, ratings: 0 },
};

const mockPrisma = {
  libraryCollection: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  libraryItem: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  libraryAccess: {
    create: jest.fn(),
    count: jest.fn(),
  },
  libraryRating: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  libraryComment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockAudit = {
  logEntity: jest.fn((userId, action, entity, entityId, meta = {}) =>
    mockPrisma.auditLog.create({
      data: { userId, action, entity, metadata: JSON.stringify({ ...meta, entityId }) },
    }),
  ),
};

describe('LibraryService', () => {
  let service: LibraryService;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<LibraryService>(LibraryService);
    jest.clearAllMocks();
  });

  describe('createCollection', () => {
    it('deve criar colecção e auditLog', async () => {
      mockPrisma.libraryCollection.create.mockResolvedValue({
        id: 'col-1',
        name: 'Manuais',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createCollection({ name: 'Manuais' }, 1);
      expect(result.id).toBe('col-1');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entity: 'LibraryCollection',
            action: 'CREATE',
          }),
        }),
      );
    });
  });

  describe('createItem', () => {
    it('deve criar item com código LIB- auto-gerado', async () => {
      mockPrisma.libraryItem.findFirst.mockResolvedValue(null);
      mockPrisma.libraryItem.create.mockResolvedValue(mockItem);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createItem(
        {
          title: 'Manual de Segurança',
          type: 'PDF' as any,
          fileUrl: 'https://storage/manual.pdf',
        },
        1,
      );
      expect(result.code).toBe('LIB-00001');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entity: 'LibraryItem',
            action: 'CREATE',
          }),
        }),
      );
    });
  });

  describe('findAllItems', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.libraryItem.findMany.mockResolvedValue([mockItem]);
      mockPrisma.libraryItem.count.mockResolvedValue(1);
      const result = await service.findAllItems({ page: 1, limit: 20 });
      expect(result).toMatchObject({
        data: expect.any(Array),
        total: 1,
        totalPages: 1,
      });
    });

    it('deve filtrar por tipo', async () => {
      mockPrisma.libraryItem.findMany.mockResolvedValue([]);
      mockPrisma.libraryItem.count.mockResolvedValue(0);
      const result = await service.findAllItems({ type: 'VIDEO' as any });
      expect(result.total).toBe(0);
    });
  });

  describe('findItemById', () => {
    it('deve retornar item com comentários e avaliações', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      const result = await service.findItemById('item-1');
      expect(result.id).toBe('item-1');
    });

    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(null);
      await expect(service.findItemById('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se deletedAt preenchido', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue({
        ...mockItem,
        deletedAt: new Date(),
      });
      await expect(service.findItemById('item-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateItem', () => {
    it('deve actualizar item e criar auditLog', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.libraryItem.update.mockResolvedValue({
        ...mockItem,
        title: 'Novo título',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateItem('item-1', { title: 'Novo título' } as any, 1);
      expect(result.title).toBe('Novo título');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('softDeleteItem', () => {
    it('deve definir deletedAt', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.libraryItem.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.softDeleteItem('item-1', 1);
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.libraryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('approveItem', () => {
    it('deve aprovar item e definir reviewedById', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.libraryItem.update.mockResolvedValue({
        ...mockItem,
        isApproved: true,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.approveItem('item-1', 1);
      expect(result.isApproved).toBe(true);
      expect(mockPrisma.libraryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isApproved: true,
            reviewedById: 1,
          }),
        }),
      );
    });
  });

  describe('view', () => {
    it('deve incrementar views e registar acesso', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.view('item-1', 1);
      expect(result.id).toBe('item-1');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('deve incrementar downloads e registar acesso', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.download('item-1', 1);
      expect(result.fileUrl).toBe('https://storage/manual.pdf');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('rateItem', () => {
    it('deve criar avaliação e recalcular média', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.libraryRating.upsert.mockResolvedValue({
        id: 'rat-1',
        score: 5,
      });
      mockPrisma.libraryRating.findMany.mockResolvedValue([{ score: 5 }, { score: 3 }]);
      mockPrisma.libraryItem.update.mockResolvedValue({});

      const result = await service.rateItem('item-1', { score: 5 }, 1);
      expect(result.score).toBe(5);
      expect(mockPrisma.libraryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rating: 4, ratingCount: 2 }),
        }),
      );
    });
  });

  describe('addComment / deleteComment', () => {
    it('deve adicionar comentário', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.libraryComment.create.mockResolvedValue({
        id: 'com-1',
        content: 'Ótimo',
      });
      const result = await service.addComment('item-1', { content: 'Ótimo' }, 1);
      expect(result.id).toBe('com-1');
    });

    it('deve remover comentário', async () => {
      mockPrisma.libraryComment.findUnique.mockResolvedValue({ id: 'com-1' });
      mockPrisma.libraryComment.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.deleteComment('com-1', 1);
      expect(result.message).toContain('removido');
    });

    it('deve lançar NotFoundException ao remover comentário inexistente', async () => {
      mockPrisma.libraryComment.findUnique.mockResolvedValue(null);
      await expect(service.deleteComment('nao-existe', 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllCollections', () => {
    it('deve listar colecções', async () => {
      mockPrisma.libraryCollection.findMany.mockResolvedValue([{ id: 'col-1' }]);
      const result = await service.findAllCollections();
      expect(result).toHaveLength(1);
    });
  });

  describe('getDashboard', () => {
    it('deve retornar totais e rankings', async () => {
      mockPrisma.libraryItem.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
      mockPrisma.libraryCollection.count.mockResolvedValue(3);
      mockPrisma.libraryItem.groupBy.mockResolvedValue([]);
      mockPrisma.libraryItem.findMany.mockResolvedValue([]);
      mockPrisma.libraryAccess.count.mockResolvedValueOnce(50).mockResolvedValueOnce(30);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('rankings');
      expect(result.totals.totalViews).toBe(50);
      expect(result.totals.totalDownloads).toBe(30);
    });
  });
});
