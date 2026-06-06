import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorkDeclarationService } from './work-declaration.service';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';

const templateMock = {
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  delete: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
};
const declarationMock = {
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};

const mockPrisma = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'declarationTemplate') return templateMock;
      if (prop === 'declaration') return declarationMock;
      return {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue({}),
      };
    },
  },
);

const mockPdf = { generateDeclaration: jest.fn().mockResolvedValue(Buffer.from('pdf')) };

const baseTemplate = {
  id: 'tmpl-1',
  name: 'Declaração Padrão',
  tenantId: 'innova',
  content: 'template {{fullName}}',
  bodyContent: 'Corpo do template',
  type: 'WORK_CERTIFICATE',
  isDefault: false,
  isActive: true,
};

const baseDeclaration = {
  id: 'decl-1',
  tenantId: 'innova',
  requestedById: 'user-1',
  templateId: 'tmpl-1',
  status: 'DRAFT',
};

describe('WorkDeclarationService — additional coverage', () => {
  let service: WorkDeclarationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkDeclarationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfService, useValue: mockPdf },
      ],
    }).compile();
    service = module.get<WorkDeclarationService>(WorkDeclarationService);
  });

  // ─── updateTemplate ───────────────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('deve actualizar template existente', async () => {
      templateMock.findFirst.mockResolvedValue(baseTemplate);
      templateMock.update.mockResolvedValue({ ...baseTemplate, name: 'Updated' });

      const result = await service.updateTemplate('innova', 'user-1', 'tmpl-1', {
        name: 'Updated',
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      templateMock.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTemplate('innova', 'user-1', 'invalid', {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteTemplate ───────────────────────────────────────────────────────

  describe('deleteTemplate', () => {
    it('deve eliminar template sem declarações (hard delete)', async () => {
      templateMock.findFirst.mockResolvedValue(baseTemplate);
      declarationMock.count.mockResolvedValue(0);
      templateMock.delete.mockResolvedValue(baseTemplate);

      const result = await service.deleteTemplate('innova', 'tmpl-1');
      expect(result).toBeDefined();
    });

    it('deve desactivar template em uso (soft delete)', async () => {
      templateMock.findFirst.mockResolvedValue(baseTemplate);
      declarationMock.count.mockResolvedValue(3);
      templateMock.update.mockResolvedValue({ ...baseTemplate, isActive: false });

      const result = await service.deleteTemplate('innova', 'tmpl-1');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      templateMock.findFirst.mockResolvedValue(null);

      await expect(service.deleteTemplate('innova', 'invalid')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listDeclarations ─────────────────────────────────────────────────────

  describe('listDeclarations', () => {
    it('deve retornar declarações paginadas', async () => {
      declarationMock.findMany.mockResolvedValue([baseDeclaration]);
      declarationMock.count.mockResolvedValue(1);

      const result = await service.listDeclarations('innova', 'user-1', 'EMPLOYEE', {});
      expect(result).toBeDefined();
    });

    it('deve filtrar por status e type', async () => {
      declarationMock.findMany.mockResolvedValue([]);
      declarationMock.count.mockResolvedValue(0);

      await service.listDeclarations('innova', 'user-1', 'RH', {
        status: 'DRAFT' as any,
        type: 'WORK_CERTIFICATE' as any,
      });
      expect(declarationMock.findMany).toHaveBeenCalled();
    });
  });

  // ─── getDeclaration ───────────────────────────────────────────────────────

  describe('getDeclaration', () => {
    it('deve retornar declaração por id', async () => {
      declarationMock.findFirst.mockResolvedValue({
        ...baseDeclaration,
        employeeId: 'user-1',
        template: baseTemplate,
      });

      const result = await service.getDeclaration('innova', 'user-1', 'EMPLOYEE', 'decl-1');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      declarationMock.findFirst.mockResolvedValue(null);

      await expect(
        service.getDeclaration('innova', 'user-1', 'EMPLOYEE', 'invalid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getTemplate ──────────────────────────────────────────────────────────

  describe('getTemplate (already existing)', () => {
    it('deve retornar template completo', async () => {
      templateMock.findFirst.mockResolvedValue(baseTemplate);

      const result = await service.getTemplate('innova', 'tmpl-1');
      expect(result).toBeDefined();
    });
  });

  // ─── listTemplates with filters ───────────────────────────────────────────

  describe('listTemplates with search', () => {
    it('deve pesquisar templates por nome', async () => {
      templateMock.findMany.mockResolvedValue([baseTemplate]);

      await service.listTemplates('innova', { search: 'Declaração' });
      expect(templateMock.findMany).toHaveBeenCalled();
    });
  });
});
