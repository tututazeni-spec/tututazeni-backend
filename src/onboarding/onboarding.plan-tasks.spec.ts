import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

const plan = { id: 7, userId: 1, templateId: 3, managerId: 2, buddyId: 3, hrResponsibleId: 4 };

const tx = {
  onboardingTemplateTask: { create: jest.fn().mockResolvedValue({ id: 50 }) },
  onboardingTaskInstance: { create: jest.fn().mockResolvedValue({ id: 90 }) },
};
const prisma: any = {
  onboardingPlan: { findUnique: jest.fn() },
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

  const dto = { title: 'Visita', category: 'SOCIAL', phase: 'DAY_1' } as any;

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
    });
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
  });

  it('recusa atribuir a quem não pertence ao plano', async () => {
    await expect(svc.createPlanTask(7, { ...dto, assigneeId: 99 })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404 se o plano não existe', async () => {
    prisma.onboardingPlan.findUnique.mockResolvedValue(null);
    await expect(svc.createPlanTask(7, dto)).rejects.toThrow(NotFoundException);
  });

  it('assignTask valida membro, grava e notifica só se mudou', async () => {
    prisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 90,
      assigneeId: 2,
      plan,
      templateTask: { title: 'T' },
    });
    await expect(svc.assignTask(90, 99)).rejects.toThrow(BadRequestException);
    await svc.assignTask(90, 2);
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    await svc.assignTask(90, 4);
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
    await svc.assignTask(90, null);
    expect(prisma.onboardingTaskInstance.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { assigneeId: null } }),
    );
  });
});
