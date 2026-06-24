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
    count: jest.fn().mockResolvedValue(0),
  },
  workDeclAnswer: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  workDeclReview: { create: jest.fn(), update: jest.fn() },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const baseForm = {
  id: 1,
  title: 'Declaração de Trabalho',
  type: 'WORKLOAD',
  active: true,
  questions: [],
};

describe('WorkDeclarationsService', () => {
  let service: WorkDeclarationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkDeclarationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();
    service = module.get<WorkDeclarationsService>(WorkDeclarationsService);
  });

  describe('getForms', () => {
    it('deve retornar formulários', async () => {
      mockPrisma.workDeclForm.findMany.mockResolvedValue([baseForm]);
      const result = await service.getForms();
      expect(result).toBeDefined();
    });
  });

  describe('getForm', () => {
    it('deve retornar formulário por id', async () => {
      mockPrisma.workDeclForm.findUnique.mockResolvedValue(baseForm);
      const result = await service.getForm(1);
      expect(result).toBeDefined();
    });
    it('deve lançar NotFoundException', async () => {
      mockPrisma.workDeclForm.findUnique.mockResolvedValue(null);
      await expect(service.getForm(99)).rejects.toThrow(NotFoundException);
    });
  });
});
