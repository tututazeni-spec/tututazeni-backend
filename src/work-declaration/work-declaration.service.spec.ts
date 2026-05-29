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
      };
    },
  },
);

const mockPdf = { generateDeclaration: jest.fn().mockResolvedValue(Buffer.from('pdf')) };

const baseTemplate = {
  id: 'tmpl-1',
  name: 'Declaração Padrão',
  tenantId: 'innova',
  content: 'template body',
};

describe('WorkDeclarationService', () => {
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

  describe('listTemplates', () => {
    it('deve retornar templates', async () => {
      templateMock.findMany.mockResolvedValue([baseTemplate]);
      const result = await service.listTemplates('innova', {});
      expect(result).toBeDefined();
    });
  });

  describe('getTemplate', () => {
    it('deve lançar NotFoundException se não encontrado', async () => {
      templateMock.findFirst.mockResolvedValue(null);
      await expect(service.getTemplate('innova', 'invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createTemplate', () => {
    it('deve criar template', async () => {
      templateMock.create.mockResolvedValue(baseTemplate);
      const result = await service.createTemplate('innova', 'user-1', {
        name: 'Declaração Padrão',
        content: 'template body',
      } as any);
      expect(result).toBeDefined();
    });
  });
});
