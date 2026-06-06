import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DocumentRepositoryService } from './document-repository.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const mockPrisma: any = {
  document: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  documentVersion: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
  documentPermission: {
    create: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  documentShareLink: {
    create: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
  },
  documentAudit: { create: jest.fn().mockResolvedValue({}) },
  docCategoryModel: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  },
  user: { findUnique: jest.fn().mockResolvedValue(null) },
};

const baseDoc = {
  id: 1, title: 'Manual de Onboarding', category: 'CORPORATE', sensitivity: 'INTERNAL',
  status: 'ACTIVE', createdById: 1, ownerId: 1, version: 1, department: 'TI',
  tags: [], fileName: 'manual.pdf', fileUrl: '/docs/manual.pdf',
  checksum: 'abc123', retentionYears: 5,
  owner: { id: 1, fullName: 'Admin', avatarUrl: null },
  createdBy: { id: 1, fullName: 'Admin' },
  _count: { versions: 0, permissions: 0 },
};

describe('DocumentRepositoryService (additional)', () => {
  let service: DocumentRepositoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentRepositoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<DocumentRepositoryService>(DocumentRepositoryService);
  });

  // ─── createCategory ───────────────────────────────────────────

  describe('createCategory', () => {
    it('deve criar categoria de documento', async () => {
      mockPrisma.docCategoryModel.create.mockResolvedValue({ id: 1, name: 'Contratos' });
      const result = await service.createCategory({ name: 'Contratos', description: 'Contratos laborais' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getCategories ────────────────────────────────────────────

  describe('getCategories', () => {
    it('deve retornar categorias activas', async () => {
      mockPrisma.docCategoryModel.findMany.mockResolvedValue([{ id: 1, name: 'Contratos' }]);
      const result = await service.getCategories();
      expect(result).toHaveLength(1);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar documentos paginados para utilizador normal', async () => {
      mockPrisma.document.findMany.mockResolvedValue([baseDoc]);
      mockPrisma.document.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 }, 1, 'TI', 'EMPLOYEE');
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve dar acesso total a ADMIN', async () => {
      mockPrisma.document.findMany.mockResolvedValue([baseDoc]);
      mockPrisma.document.count.mockResolvedValue(1);
      await service.findAll({ page: 1, limit: 10 }, 1, undefined, 'ADMIN');
      expect(mockPrisma.document.findMany).toHaveBeenCalled();
    });

    it('deve filtrar por search, category, sensitivity, tag', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.document.count.mockResolvedValue(0);
      await service.findAll({ search: 'manual', category: 'CORPORATE' as any, sensitivity: 'INTERNAL' as any, tag: 'onboarding' }, 1);
      expect(mockPrisma.document.findMany).toHaveBeenCalled();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar documento e registar auditoria', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(baseDoc);
      const result = await service.findOne(1, 1, 'TI', 'EMPLOYEE');
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se documento não existe', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar documento com checksum e retenção', async () => {
      mockPrisma.document.create.mockResolvedValue(baseDoc);
      const result = await service.create(
        { title: 'Manual', category: 'CORPORATE' as any, sensitivity: 'INTERNAL' as any, fileName: 'manual.pdf', fileUrl: '/docs/manual.pdf' } as any,
        1,
      );
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOCUMENT_CREATED' }));
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar documento pelo proprietário', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(baseDoc);
      mockPrisma.document.update.mockResolvedValue({ ...baseDoc, title: 'Actualizado' });
      const result = await service.update(1, { title: 'Actualizado' } as any, 1, 'EMPLOYEE');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se documento não existe', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se não é proprietário', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({ ...baseDoc, ownerId: 2, createdById: 2 });
      await expect(service.update(1, {} as any, 99, 'EMPLOYEE')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── archive ──────────────────────────────────────────────────

  describe('archive', () => {
    it('deve arquivar documento', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(baseDoc);
      mockPrisma.document.update.mockResolvedValue({ ...baseDoc, status: 'ARCHIVED' });
      const result = await service.archive(1, 1, 'ADMIN');
      expect(result).toBeDefined();
    });
  });

  // ─── addVersion ───────────────────────────────────────────────

  describe('addVersion', () => {
    it('deve adicionar nova versão ao documento', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(baseDoc);
      mockPrisma.documentVersion.create.mockResolvedValue({ id: 1, documentId: 1, version: 2 });
      mockPrisma.document.update.mockResolvedValue({ ...baseDoc, version: 2 });
      const result = await service.addVersion(1, { fileName: 'manual_v2.pdf', fileUrl: '/docs/manual_v2.pdf', changeNotes: 'Actualizado' } as any, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── grantPermission ─────────────────────────────────────────

  describe('grantPermission', () => {
    it('deve conceder permissão de acesso ao documento', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(baseDoc);
      mockPrisma.documentPermission.create.mockResolvedValue({ id: 1 });
      const result = await service.grantPermission(1, { userId: 2, accessLevel: 'READ' as any } as any, 1, 'ADMIN');
      expect(result).toBeDefined();
    });
  });

  // ─── createShareLink ──────────────────────────────────────────

  describe('createShareLink', () => {
    it('deve criar link de partilha com token único', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(baseDoc);
      mockPrisma.documentShareLink.create.mockResolvedValue({ id: 1, token: 'abc123', documentId: 1 });
      const result = await service.createShareLink(1, { expiresAt: '2026-12-31', accessLevel: 'READ' as any } as any, 1, 'ADMIN');
      expect(result).toBeDefined();
    });
  });

  // ─── getVersions ─────────────────────────────────────────────

  describe('getVersions', () => {
    it('deve retornar historial de versões do documento', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(baseDoc);
      mockPrisma.documentVersion.findMany.mockResolvedValue([{ id: 1, version: 1 }]);
      const result = await service.getVersions(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── getStats ────────────────────────────────────────────────

  describe('getStats', () => {
    it('deve retornar estatísticas do repositório', async () => {
      mockPrisma.document.count.mockResolvedValue(50);
      const result = await service.getStats();
      expect(result).toBeDefined();
    });
  });
});
