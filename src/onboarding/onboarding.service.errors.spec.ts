import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  onboardingTaskInstance: {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn(),
  },
  onboardingPlan: {
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findUnique: jest.fn(),
  },
  userPoints: { upsert: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('OnboardingService — completeTask', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [OnboardingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<OnboardingService>(OnboardingService);
  });

  it('tarefa inexistente → NotFoundException', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue(null);
    await expect(service.completeTask({ taskInstanceId: 1 } as any, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('utilizador diferente do dono do plano → ForbiddenException', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      status: 'PENDING',
      plan: { userId: 7, id: 1 },
      templateTask: { dependsOn: [], requiresApproval: false },
    });
    await expect(service.completeTask({ taskInstanceId: 1 } as any, 999)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('tarefa já concluída → ConflictException', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      status: 'COMPLETED',
      plan: { userId: 7, id: 1 },
      templateTask: {},
    });
    await expect(service.completeTask({ taskInstanceId: 1 } as any, 7)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('tarefa bloqueada → BadRequestException', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      status: 'BLOCKED',
      plan: { userId: 7, id: 1 },
      templateTask: {},
    });
    await expect(service.completeTask({ taskInstanceId: 1 } as any, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('dependências ainda não concluídas → BadRequestException', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      planId: 10,
      status: 'PENDING',
      plan: { userId: 7, id: 10 },
      templateTask: { dependsOn: [99], requiresApproval: false },
    });
    mockPrisma.onboardingTaskInstance.findMany.mockResolvedValue([{ id: 99, status: 'PENDING' }]);

    await expect(service.completeTask({ taskInstanceId: 1 } as any, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockPrisma.onboardingTaskInstance.update).not.toHaveBeenCalled();
  });

  it('tarefa que requer aprovação fica IN_PROGRESS, sem atribuir XP nem fechar o plano', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      planId: 10,
      status: 'PENDING',
      plan: { userId: 7, id: 10 },
      templateTask: { dependsOn: [], requiresApproval: true, xpReward: 50 },
    });

    const result = await service.completeTask({ taskInstanceId: 1 } as any, 7);

    expect(result).toEqual({ completed: false, pendingApproval: true });
    expect(mockPrisma.onboardingTaskInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) }),
    );
    expect(mockPrisma.userPoints.upsert).not.toHaveBeenCalled();
  });

  it('tarefa sem aprovação atribui XP e verifica conclusão do plano', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      planId: 10,
      status: 'PENDING',
      plan: { userId: 7, id: 10 },
      templateTask: { dependsOn: [], requiresApproval: false, xpReward: 30 },
    });
    mockPrisma.onboardingTaskInstance.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // total=1, completed=1 → plano completo
    mockPrisma.onboardingPlan.findUnique.mockResolvedValue({
      userId: 7,
      template: { name: 'Plano Teste' },
    });

    const result = await service.completeTask({ taskInstanceId: 1 } as any, 7);

    expect(result).toEqual({ completed: true, pendingApproval: false });
    expect(mockPrisma.userPoints.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
    // Plano 100% concluído → status COMPLETED + bónus de 500 XP + notificação
    expect(mockPrisma.onboardingPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 7, type: 'ONBOARDING_COMPLETED' }),
      }),
    );
  });

  it('plano ainda incompleto não é marcado como COMPLETED', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      planId: 10,
      status: 'PENDING',
      plan: { userId: 7, id: 10 },
      templateTask: { dependsOn: [], requiresApproval: false, xpReward: 0 },
    });
    mockPrisma.onboardingTaskInstance.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1); // total=3, completed=1

    await service.completeTask({ taskInstanceId: 1 } as any, 7);

    expect(mockPrisma.onboardingPlan.update).not.toHaveBeenCalled();
  });
});

describe('OnboardingService — skipTask / approveTask', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [OnboardingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<OnboardingService>(OnboardingService);
  });

  it('skipTask com tarefa inexistente → NotFoundException', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue(null);
    await expect(service.skipTask({ taskInstanceId: 1 } as any, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('skipTask marca a tarefa como SKIPPED com o motivo', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({ id: 1 });
    await service.skipTask({ taskInstanceId: 1, reason: 'Não aplicável' } as any, 5);
    expect(mockPrisma.onboardingTaskInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SKIPPED', skipReason: 'Não aplicável' }),
      }),
    );
  });

  it('approveTask com tarefa inexistente → NotFoundException', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue(null);
    await expect(
      service.approveTask({ taskInstanceId: 1, decision: 'approve' } as any, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('approveTask rejeitada (decision=reject) volta a PENDING e não atribui XP', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      planId: 10,
      plan: { userId: 7 },
      templateTask: { xpReward: 50 },
    });

    const result = await service.approveTask({ taskInstanceId: 1, decision: 'reject' } as any, 2);

    expect(result.decision).toBe('reject');
    expect(mockPrisma.onboardingTaskInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    );
    expect(mockPrisma.userPoints.upsert).not.toHaveBeenCalled();
  });

  it('approveTask aprovada atribui XP ao dono do plano e verifica conclusão', async () => {
    mockPrisma.onboardingTaskInstance.findUnique.mockResolvedValue({
      id: 1,
      planId: 10,
      plan: { userId: 7 },
      templateTask: { xpReward: 50 },
    });
    mockPrisma.onboardingTaskInstance.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await service.approveTask({ taskInstanceId: 1, decision: 'approve' } as any, 2);

    expect(mockPrisma.userPoints.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
  });
});
