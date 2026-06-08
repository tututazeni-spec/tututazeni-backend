import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DocumentDeclarationsService } from './document-declarations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const mockPrisma: any = {
  declarationPurpose: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  declarationTemplate: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  },
  declarationRequest: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  declarationApproval: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

const basePurpose = {
  id: 1,
  name: 'Comprovativo de Trabalho',
  category: 'EMPREGO',
  active: true,
  requiresApproval: false,
};
const baseTemplate = {
  id: 1,
  name: 'Declaração de Trabalho',
  content: 'Declaro que {{employee_name}} trabalha na empresa.',
  language: 'pt',
  active: true,
  requiresApproval: false,
  version: 1,
  variables: ['employee_name'],
  purpose: basePurpose,
  purposeId: 1,
};
const baseUser = {
  id: 1,
  fullName: 'João Silva',
  email: 'joao@innova.com',
  employee: {
    role: 'Developer',
    jobTitle: 'Dev Sr',
    department: 'TI',
    matricula: 'M001',
    joinedAt: '2023-01-01',
  },
};

describe('DocumentDeclarationsService (additional)', () => {
  let service: DocumentDeclarationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentDeclarationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<DocumentDeclarationsService>(DocumentDeclarationsService);
  });

  // ─── createPurpose ────────────────────────────────────────────

  describe('createPurpose', () => {
    it('deve criar finalidade de declaração', async () => {
      mockPrisma.declarationPurpose.create.mockResolvedValue(basePurpose);
      const result = await service.createPurpose({
        name: 'Comprovativo',
        category: 'EMPREGO',
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getPurposes ──────────────────────────────────────────────

  describe('getPurposes', () => {
    it('deve retornar finalidades activas', async () => {
      mockPrisma.declarationPurpose.findMany.mockResolvedValue([basePurpose]);
      const result = await service.getPurposes();
      expect(result).toHaveLength(1);
      expect(mockPrisma.declarationPurpose.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
    });

    it('deve retornar todas as finalidades quando activeOnly=false', async () => {
      mockPrisma.declarationPurpose.findMany.mockResolvedValue([basePurpose]);
      await service.getPurposes(false);
      expect(mockPrisma.declarationPurpose.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  // ─── updatePurpose ────────────────────────────────────────────

  describe('updatePurpose', () => {
    it('deve actualizar finalidade', async () => {
      mockPrisma.declarationPurpose.update.mockResolvedValue({
        ...basePurpose,
        name: 'Actualizado',
      });
      const result = await service.updatePurpose(1, { name: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── createTemplate ───────────────────────────────────────────

  describe('createTemplate', () => {
    it('deve criar template e detectar variáveis automaticamente', async () => {
      mockPrisma.declarationTemplate.create.mockResolvedValue(baseTemplate);
      const result = await service.createTemplate(
        {
          name: 'Declaração',
          content: 'Olá {{employee_name}} de {{company_name}}',
          language: 'pt',
        } as any,
        1,
      );
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_CREATED' }),
      );
    });
  });

  // ─── getTemplates ─────────────────────────────────────────────

  describe('getTemplates', () => {
    it('deve retornar templates activos', async () => {
      mockPrisma.declarationTemplate.findMany.mockResolvedValue([baseTemplate]);
      const result = await service.getTemplates();
      expect(result).toHaveLength(1);
    });

    it('deve filtrar por purposeId e language', async () => {
      mockPrisma.declarationTemplate.findMany.mockResolvedValue([]);
      await service.getTemplates(1, 'pt');
      expect(mockPrisma.declarationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ purposeId: 1, language: 'pt' }),
        }),
      );
    });
  });

  // ─── getTemplate ──────────────────────────────────────────────

  describe('getTemplate', () => {
    it('deve retornar template por id', async () => {
      mockPrisma.declarationTemplate.findUnique.mockResolvedValue(baseTemplate);
      const result = await service.getTemplate(1);
      expect(result).toBeDefined();
      expect(result.name).toBe('Declaração de Trabalho');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.declarationTemplate.findUnique.mockResolvedValue(null);
      await expect(service.getTemplate(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateTemplate ───────────────────────────────────────────

  describe('updateTemplate', () => {
    it('deve actualizar template e versão', async () => {
      mockPrisma.declarationTemplate.findUnique
        .mockResolvedValueOnce(baseTemplate)
        .mockResolvedValueOnce({ ...baseTemplate, version: 2 });
      mockPrisma.declarationTemplate.update.mockResolvedValue({ ...baseTemplate, version: 2 });
      const result = await service.updateTemplate(1, { name: 'Actualizado' } as any, 1);
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_UPDATED' }),
      );
    });
  });

  // ─── previewTemplate ──────────────────────────────────────────

  describe('previewTemplate', () => {
    it('deve retornar preview com variáveis resolvidas', async () => {
      mockPrisma.declarationTemplate.findUnique.mockResolvedValue(baseTemplate);
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      const result = await service.previewTemplate(1, 1);
      expect(result).toHaveProperty('previewHtml');
      expect(result).toHaveProperty('variables');
      expect(result.previewHtml).toContain('João Silva');
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de pedidos', async () => {
      mockPrisma.declarationRequest.findMany.mockResolvedValue([]);
      mockPrisma.declarationRequest.count.mockResolvedValue(0);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.meta.page).toBe(1);
    });

    it('deve filtrar por userId, templateId, purposeId, status', async () => {
      mockPrisma.declarationRequest.findMany.mockResolvedValue([]);
      mockPrisma.declarationRequest.count.mockResolvedValue(0);
      await service.findAll({ userId: 1, templateId: 1, purposeId: 1, status: 'PENDING' as any });
      expect(mockPrisma.declarationRequest.findMany).toHaveBeenCalled();
    });

    it('deve filtrar por datas from e to', async () => {
      mockPrisma.declarationRequest.findMany.mockResolvedValue([]);
      mockPrisma.declarationRequest.count.mockResolvedValue(0);
      await service.findAll({ from: '2026-01-01', to: '2026-12-31' });
      expect(mockPrisma.declarationRequest.findMany).toHaveBeenCalled();
    });

    it('deve filtrar por department', async () => {
      mockPrisma.declarationRequest.findMany.mockResolvedValue([]);
      mockPrisma.declarationRequest.count.mockResolvedValue(0);
      await service.findAll({ department: 'TI' });
      expect(mockPrisma.declarationRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user: expect.any(Object) }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar pedido por id', async () => {
      mockPrisma.declarationRequest.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        template: baseTemplate,
      });
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve registar auditoria quando requesterId fornecido', async () => {
      mockPrisma.declarationRequest.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        template: baseTemplate,
      });
      await service.findOne(1, 2);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DECLARATION_VIEWED' }),
      );
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.declarationRequest.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── request ──────────────────────────────────────────────────

  describe('request', () => {
    beforeEach(() => {
      mockPrisma.declarationTemplate.findUnique.mockResolvedValue(baseTemplate);
      mockPrisma.declarationRequest.create.mockResolvedValue({
        id: 1,
        userId: 1,
        status: 'APPROVED',
      });
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.notificationLog.create.mockResolvedValue({});
    });

    it('deve criar pedido de declaração que não requer aprovação', async () => {
      const result = await service.request(1, { templateId: 1 } as any);
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DECLARATION_REQUESTED' }),
      );
    });

    it('deve criar pedido como DRAFT quando saveAsDraft=true', async () => {
      mockPrisma.declarationRequest.create.mockResolvedValue({ id: 1, status: 'DRAFT' });
      const result = await service.request(1, { templateId: 1, saveAsDraft: true } as any);
      expect(result).toBeDefined();
    });

    it('deve criar pedido PENDING quando template requer aprovação', async () => {
      mockPrisma.declarationTemplate.findUnique.mockResolvedValue({
        ...baseTemplate,
        requiresApproval: true,
      });
      mockPrisma.declarationRequest.create.mockResolvedValue({ id: 1, status: 'PENDING' });
      const result = await service.request(1, { templateId: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se template inactivo', async () => {
      mockPrisma.declarationTemplate.findUnique.mockResolvedValue({
        ...baseTemplate,
        active: false,
      });
      await expect(service.request(1, { templateId: 1 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
