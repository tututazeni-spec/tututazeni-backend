import { Test, TestingModule } from '@nestjs/testing';
import { DocumentDeclarationsService } from './document-declarations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockPrisma = {
  declarationPurpose: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  declarationTemplate: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  declarationRequest: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  declarationApproval: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('DocumentDeclarationsService', () => {
  let service: DocumentDeclarationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentDeclarationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();
    service = module.get<DocumentDeclarationsService>(DocumentDeclarationsService);
  });

  describe('getPurposes', () => {
    it('deve retornar propósitos', async () => {
      mockPrisma.declarationPurpose.findMany.mockResolvedValue([{ id: 1, name: 'Trabalho' }]);
      const result = await service.getPurposes();
      expect(result).toHaveLength(1);
    });
  });

  describe('getTemplates', () => {
    it('deve retornar templates', async () => {
      mockPrisma.declarationTemplate.findMany.mockResolvedValue([{ id: 1, title: 'Tmpl' }]);
      const result = await service.getTemplates();
      expect(result).toBeDefined();
    });
  });
});
