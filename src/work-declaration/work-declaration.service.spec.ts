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
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
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

// ─────────────────────────────────────────────────────────────────────────────
// Ownership tests (A3-2)
// ─────────────────────────────────────────────────────────────────────────────

const employeeA = { id: 7, role: { name: 'COLABORADOR' } } as any;
const employeeB = { id: 8, role: { name: 'COLABORADOR' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

function makeService(declaration: any, findManyResult: any[] = []) {
  const prisma = {
    declaration: {
      findMany: jest.fn().mockResolvedValue(findManyResult),
      count: jest.fn().mockResolvedValue(findManyResult.length),
      findUnique: jest.fn().mockResolvedValue(declaration),
      findFirst: jest.fn().mockResolvedValue(declaration),
    },
  } as any;
  return new WorkDeclarationService(prisma, {} as any);
}

describe('WorkDeclarationService ownership (A3-2)', () => {
  const declOfA = { id: 'd1', employeeId: '7', tenantId: 't1' };

  it('getDeclaration: outro colaborador recebe 404', async () => {
    const svc = makeService(declOfA);
    await expect(svc.getDeclaration('t1', employeeB, 'd1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getDeclaration: o dono acede', async () => {
    const svc = makeService(declOfA);
    await expect(svc.getDeclaration('t1', employeeA, 'd1')).resolves.toMatchObject({ id: 'd1' });
  });

  it('getDeclaration: RH acede a qualquer', async () => {
    const svc = makeService(declOfA);
    await expect(svc.getDeclaration('t1', rh, 'd1')).resolves.toMatchObject({ id: 'd1' });
  });

  it('listDeclarations: colaborador força employeeId próprio no where', async () => {
    const svc = makeService(null, []);
    await svc.listDeclarations('t1', employeeA, {} as any);
    const prisma: any = (svc as any).prisma;
    const whereArg = prisma.declaration.findMany.mock.calls[0][0].where;
    expect(whereArg.employeeId).toBe('7');
  });

  it('listDeclarations: RH não é forçado ao próprio (sem employeeId no where quando não filtra)', async () => {
    const svc = makeService(null, []);
    await svc.listDeclarations('t1', rh, {} as any);
    const prisma: any = (svc as any).prisma;
    const whereArg = prisma.declaration.findMany.mock.calls[0][0].where;
    expect(whereArg.employeeId).toBeUndefined();
  });
});
