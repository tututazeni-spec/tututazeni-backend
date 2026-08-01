import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkDeclarationsService } from './work-declarations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

const mockPrisma = {
  workDeclForm: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  workDeclSubmission: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  workDeclAnswer: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  workDeclReview: { upsert: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const activeForm = {
  id: 1,
  title: 'Declaração de Teletrabalho',
  active: true,
  mandatory: true,
  questions: [{ key: 'q1', required: true }],
};

const rh = { id: 1, role: { name: 'RH' } } as any;
const owner = { id: 7, role: { name: 'COLABORADOR' } } as any;
const other = { id: 8, role: { name: 'COLABORADOR' } } as any;

describe('WorkDeclarationsService — submit (erros)', () => {
  let service: WorkDeclarationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkDeclarationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<WorkDeclarationsService>(WorkDeclarationsService);
  });

  it('formulário inactivo → BadRequestException', async () => {
    mockPrisma.workDeclForm.findUnique.mockResolvedValue({ ...activeForm, active: false });
    await expect(
      service.submit(7, { formId: 1, answers: [{ key: 'q1', value: 'x' }] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('formulário inexistente → NotFoundException', async () => {
    mockPrisma.workDeclForm.findUnique.mockResolvedValue(null);
    await expect(service.submit(7, { formId: 999, answers: [] } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('já existe submissão SUBMITTED activa → BadRequestException (não permite duplicar)', async () => {
    mockPrisma.workDeclForm.findUnique.mockResolvedValue(activeForm);
    mockPrisma.workDeclSubmission.findFirst.mockResolvedValue({ id: 5, status: 'SUBMITTED' });
    await expect(
      service.submit(7, { formId: 1, answers: [{ key: 'q1', value: 'x' }] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.workDeclSubmission.create).not.toHaveBeenCalled();
  });

  it('já existe submissão APPROVED → BadRequestException', async () => {
    mockPrisma.workDeclForm.findUnique.mockResolvedValue(activeForm);
    mockPrisma.workDeclSubmission.findFirst.mockResolvedValue({ id: 5, status: 'APPROVED' });
    await expect(
      service.submit(7, { formId: 1, answers: [{ key: 'q1', value: 'x' }] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submissão REJECTED anterior permite nova submissão (não bloqueia, actualiza a mesma linha por causa do @@unique([userId, formId]))', async () => {
    mockPrisma.workDeclForm.findUnique.mockResolvedValue(activeForm);
    mockPrisma.workDeclSubmission.findFirst.mockResolvedValue({ id: 5, status: 'REJECTED' });
    mockPrisma.workDeclSubmission.update.mockResolvedValue({ id: 5, status: 'SUBMITTED' });
    await expect(
      service.submit(7, { formId: 1, answers: [{ key: 'q1', value: 'x' }] } as any),
    ).resolves.toBeDefined();
    expect(mockPrisma.workDeclSubmission.update).toHaveBeenCalled();
    expect(mockPrisma.workDeclSubmission.create).not.toHaveBeenCalled();
  });

  it('faltam campos obrigatórios (sem saveAsDraft) → BadRequestException', async () => {
    mockPrisma.workDeclForm.findUnique.mockResolvedValue(activeForm);
    mockPrisma.workDeclSubmission.findFirst.mockResolvedValue(null);
    await expect(service.submit(7, { formId: 1, answers: [] } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockPrisma.workDeclSubmission.create).not.toHaveBeenCalled();
  });

  it('saveAsDraft ignora a validação de campos obrigatórios', async () => {
    mockPrisma.workDeclForm.findUnique.mockResolvedValue(activeForm);
    mockPrisma.workDeclSubmission.findFirst.mockResolvedValue(null);
    mockPrisma.workDeclSubmission.create.mockResolvedValue({ id: 6, status: 'DRAFT' });
    await expect(
      service.submit(7, { formId: 1, answers: [], saveAsDraft: true } as any),
    ).resolves.toBeDefined();
  });

  it('rascunho existente é actualizado (respostas antigas apagadas primeiro)', async () => {
    mockPrisma.workDeclForm.findUnique.mockResolvedValue(activeForm);
    mockPrisma.workDeclSubmission.findFirst.mockResolvedValue({ id: 9, status: 'DRAFT' });
    mockPrisma.workDeclSubmission.update.mockResolvedValue({ id: 9, status: 'SUBMITTED' });
    await service.submit(7, { formId: 1, answers: [{ key: 'q1', value: 'x' }] } as any);
    expect(mockPrisma.workDeclAnswer.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: 9 },
    });
    expect(mockPrisma.workDeclSubmission.update).toHaveBeenCalled();
    expect(mockPrisma.workDeclSubmission.create).not.toHaveBeenCalled();
  });
});

describe('WorkDeclarationsService — findOneSubmission (ownership A10-19)', () => {
  let service: WorkDeclarationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkDeclarationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<WorkDeclarationsService>(WorkDeclarationsService);
  });

  it('o dono acede à própria submissão', async () => {
    mockPrisma.workDeclSubmission.findUnique.mockResolvedValue({ id: 1, userId: 7 });
    await expect(service.findOneSubmission(1, owner)).resolves.toMatchObject({ id: 1 });
  });

  it('outro colaborador não pode ver submissão alheia → NotFoundException', async () => {
    mockPrisma.workDeclSubmission.findUnique.mockResolvedValue({ id: 1, userId: 7 });
    await expect(service.findOneSubmission(1, other)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RH pode ver qualquer submissão', async () => {
    mockPrisma.workDeclSubmission.findUnique.mockResolvedValue({ id: 1, userId: 7 });
    await expect(service.findOneSubmission(1, rh)).resolves.toMatchObject({ id: 1 });
  });

  it('sem user (chamada interna) e submissão inexistente → NotFoundException', async () => {
    mockPrisma.workDeclSubmission.findUnique.mockResolvedValue(null);
    await expect(service.findOneSubmission(1)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WorkDeclarationsService — review e bulkApprove', () => {
  let service: WorkDeclarationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkDeclarationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<WorkDeclarationsService>(WorkDeclarationsService);
  });

  it('rever submissão que não está SUBMITTED → BadRequestException', async () => {
    mockPrisma.workDeclSubmission.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      status: 'APPROVED',
      form: { title: 'x' },
    });
    await expect(service.review(1, { approved: true } as any, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockPrisma.workDeclSubmission.update).not.toHaveBeenCalled();
  });

  it('aprova submissão pendente → status APPROVED e notifica', async () => {
    mockPrisma.workDeclSubmission.findUnique
      .mockResolvedValueOnce({ id: 1, userId: 7, status: 'SUBMITTED', form: { title: 'Decl' } })
      .mockResolvedValueOnce({ id: 1, userId: 7, status: 'APPROVED', form: { title: 'Decl' } });
    mockPrisma.workDeclSubmission.update.mockResolvedValue({});

    await service.review(1, { approved: true } as any, 1);

    expect(mockPrisma.workDeclSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 7 }) }),
    );
  });

  it('bulkApprove agrega sucessos e falhas independentemente (Promise.allSettled)', async () => {
    mockPrisma.workDeclSubmission.findUnique
      .mockResolvedValueOnce({ id: 1, userId: 7, status: 'SUBMITTED', form: { title: 'A' } })
      .mockResolvedValueOnce({ id: 1, userId: 7, status: 'APPROVED', form: { title: 'A' } })
      .mockResolvedValueOnce({ id: 2, userId: 8, status: 'APPROVED', form: { title: 'B' } }); // já processada → falha
    mockPrisma.workDeclSubmission.update.mockResolvedValue({});

    const result = await service.bulkApprove({ submissionIds: [1, 2], approved: true } as any, 1);

    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
  });
});
