import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorkDeclarationsService } from './work-declarations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockPrisma = {
  workDeclForm: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  workDeclQuestion: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  workDeclSubmission: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn(),
  },
  workDeclAnswer: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  workDeclReview: { create: jest.fn(), update: jest.fn() },
  user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const baseForm = {
  id: 1,
  title: 'Declaração de Trabalho',
  type: 'WORKLOAD',
  active: true,
  questions: [{ id: 1, text: 'Pergunta 1', type: 'TEXT', required: true }],
};

describe('WorkDeclarationsService — additional coverage', () => {
  let service: WorkDeclarationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkDeclarationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<WorkDeclarationsService>(WorkDeclarationsService);
  });

  // ─── createForm ───────────────────────────────────────────────────────────

  describe('createForm', () => {
    it('deve criar formulário de declaração', async () => {
      mockPrisma.workDeclForm.create.mockResolvedValue(baseForm);

      const result = await service.createForm(
        { title: 'Declaração Teste', type: 'WORKLOAD' as any, questions: [] } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── updateForm ───────────────────────────────────────────────────────────

  describe('updateForm', () => {
    it('deve actualizar formulário sem alterar questões', async () => {
      mockPrisma.workDeclForm.update.mockResolvedValue({ ...baseForm, title: 'Updated' });

      const result = await service.updateForm(1, { title: 'Updated' } as any, 1);
      expect(result).toBeDefined();
    });

    it('deve substituir questões quando fornecidas', async () => {
      mockPrisma.workDeclForm.update.mockResolvedValue(baseForm);

      await service.updateForm(
        1,
        { questions: [{ text: 'Nova Pergunta', type: 'TEXT' }] } as any,
        1,
      );

      expect(mockPrisma.workDeclQuestion.deleteMany).toHaveBeenCalled();
    });
  });

  // ─── getPendingForUser ────────────────────────────────────────────────────

  describe('getPendingForUser', () => {
    it('deve retornar formulários pendentes para o utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        fullName: 'Test',
        departmentId: 1,
        roleId: 1,
      });
      mockPrisma.workDeclForm.findMany.mockResolvedValue([baseForm]);
      mockPrisma.workDeclSubmission.findMany.mockResolvedValue([]);

      const result = await service.getPendingForUser(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se utilizador não encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getPendingForUser(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── submitForm ───────────────────────────────────────────────────────────

  describe('submitForm', () => {
    it('deve submeter declaração preenchida', async () => {
      mockPrisma.workDeclForm.findUnique.mockResolvedValue({
        ...baseForm,
        requiresDigitalSignature: false,
      });
      mockPrisma.workDeclSubmission.findFirst.mockResolvedValue(null);
      mockPrisma.workDeclSubmission.create.mockResolvedValue({
        id: 1,
        formId: 1,
        userId: 1,
        status: 'SUBMITTED',
      });

      const result = await service.submit(1, {
        formId: 1,
        answers: [{ questionId: 1, value: 'Resposta 1' }],
      } as any);

      expect(result).toBeDefined();
    });
  });

  // ─── getForms with filters ────────────────────────────────────────────────

  describe('getForms with filters', () => {
    it('deve filtrar por tipo', async () => {
      mockPrisma.workDeclForm.findMany.mockResolvedValue([baseForm]);

      const result = await service.getForms('WORKLOAD' as any);
      expect(result).toBeDefined();
    });

    it('deve incluir forms inactivos quando activeOnly=false', async () => {
      mockPrisma.workDeclForm.findMany.mockResolvedValue([{ ...baseForm, active: false }]);

      const result = await service.getForms(undefined, false);
      expect(result).toBeDefined();
    });
  });
});
