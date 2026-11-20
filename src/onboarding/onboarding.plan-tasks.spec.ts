import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

const plan = { id: 7, userId: 1, templateId: 3, managerId: 2, buddyId: 3, hrResponsibleId: 4 };

const tx = {
  onboardingTemplateTask: { create: jest.fn().mockResolvedValue({ id: 50 }) },
  onboardingTaskInstance: {
    create: jest.fn().mockResolvedValue({ id: 90 }),
    createMany: jest.fn().mockResolvedValue({ count: 2 }),
  },
};
const users: Record<number, any> = {
  1: { id: 1, active: true, departmentId: 10, role: { name: 'COLABORADOR' } },
  3: { id: 3, active: true, departmentId: 10, role: { name: 'COLABORADOR' } },
  4: { id: 4, active: true, departmentId: 20, role: { name: 'RH' } },
  99: { id: 99, active: true, departmentId: 30, role: { name: 'COLABORADOR' } },
};
const prisma: any = {
  user: {
    findUnique: jest.fn(({ where }: any) => Promise.resolve(users[where.id] ?? null)),
    findMany: jest.fn().mockResolvedValue([]),
  },
  onboardingPlan: { findUnique: jest.fn(), findMany: jest.fn() },
  onboardingTemplate: { findUnique: jest.fn() },
  onboardingTemplateTask: { aggregate: jest.fn().mockResolvedValue({ _max: { seq: 4 } }) },
  onboardingTaskInstance: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({ id: 90 }),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn((fn: any) => fn(tx)),
};
prisma.read = prisma;

describe('OnboardingService — tarefas avulsas e atribuição', () => {
  let svc: OnboardingService;
  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.onboardingPlan.findUnique.mockResolvedValue(plan);
    const mod = await Test.createTestingModule({
      providers: [OnboardingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(OnboardingService);
  });

  const dto = {
    title: 'Visita',
    category: 'SOCIAL',
    phase: 'DAY_1',
    startDate: '2026-12-01',
    dueDate: '2026-12-05',
  } as any;

  it('cria tarefa avulsa (isAdHoc) com seq seguinte e notifica o atribuído', async () => {
    await svc.createPlanTask(7, { ...dto, assigneeId: 3 });
    expect(tx.onboardingTemplateTask.create.mock.calls[0][0].data).toMatchObject({
      templateId: 3,
      isAdHoc: true,
      seq: 5,
      responsible: 'BUDDY',
    });
    expect(tx.onboardingTaskInstance.create.mock.calls[0][0].data).toMatchObject({
      planId: 7,
      assigneeId: 3,
      startDate: new Date('2026-12-01'),
      dueDate: new Date('2026-12-05'),
    });
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
  });

  it('recusa responsável de outro departamento que não é RH', async () => {
    await expect(svc.createPlanTask(7, { ...dto, assigneeId: 99 })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aceita RH de outro departamento e recusa data de fim anterior ao início', async () => {
    await svc.createPlanTask(7, { ...dto, assigneeId: 4 });
    expect(tx.onboardingTemplateTask.create.mock.calls[0][0].data.responsible).toBe('HR');
    await expect(svc.createPlanTask(7, { ...dto, dueDate: '2026-11-01' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('sem colaborador: cria uma instância por plano activo do template', async () => {
    prisma.onboardingTemplate.findUnique.mockResolvedValue({ id: 3, tasks: [] });
    prisma.onboardingPlan.findMany.mockResolvedValue([{ id: 7 }, { id: 8 }]);
    const r = await svc.createTemplatePlansTask(3, dto);
    expect(r).toEqual({ created: 2 });
    const rows = tx.onboardingTaskInstance.createMany.mock.calls[0][0].data;
    expect(rows.map((x: any) => x.planId)).toEqual([7, 8]);
    expect(tx.onboardingTemplateTask.create.mock.calls[0][0].data.isAdHoc).toBe(true);
  });

  it('sem colaborador e sem planos activos recusa', async () => {
    prisma.onboardingTemplate.findUnique.mockResolvedValue({ id: 3, tasks: [] });
    prisma.onboardingPlan.findMany.mockResolvedValue([]);
    await expect(svc.createTemplatePlansTask(3, dto)).rejects.toThrow(BadRequestException);
  });

  it('404 se o plano não existe', async () => {
    prisma.onboardingPlan.findUnique.mockResolvedValue(null);
    await expect(svc.createPlanTask(7, dto)).rejects.toThrow(NotFoundException);
  });

  it('assignTask valida membro, grava e notifica só se mudou', async () => {
    prisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 90,
      assigneeId: 3,
      plan,
      templateTask: { title: 'T' },
    });
    await expect(svc.assignTask(90, 99)).rejects.toThrow(BadRequestException);
    await svc.assignTask(90, 3);
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    await svc.assignTask(90, 4);
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
    await svc.assignTask(90, null);
    expect(prisma.onboardingTaskInstance.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { assigneeId: null } }),
    );
  });
});
