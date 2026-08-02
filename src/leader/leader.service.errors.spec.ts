import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LeaderService } from './leader.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  developmentPlan: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  pdiApproval: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const leader = { id: 10, role: { name: 'LIDER' } } as any;
const otherLeader = { id: 20, role: { name: 'LIDER' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

describe('LeaderService.approvePlan — ownership', () => {
  let service: LeaderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaderService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LeaderService>(LeaderService);
  });

  it('PDI inexistente → NotFoundException', async () => {
    mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
    await expect(service.approvePlan(1, leader)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.developmentPlan.update).not.toHaveBeenCalled();
  });

  it('LIDER de outra equipa não pode aprovar PDI alheio → NotFoundException', async () => {
    mockPrisma.developmentPlan.findUnique.mockResolvedValue({
      id: 1,
      user: { managerId: leader.id },
    });
    await expect(service.approvePlan(1, otherLeader)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.developmentPlan.update).not.toHaveBeenCalled();
  });

  it('o gestor directo do colaborador pode aprovar o PDI', async () => {
    mockPrisma.developmentPlan.findUnique.mockResolvedValue({
      id: 1,
      user: { managerId: leader.id },
    });
    mockPrisma.developmentPlan.update.mockResolvedValue({
      id: 1,
      userId: 5,
      name: 'PDI Teste',
      user: { id: 5, fullName: 'Colaborador' },
    });

    const result = await service.approvePlan(1, leader);

    expect(mockPrisma.developmentPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
    expect(mockPrisma.pdiApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ planId: 1, approverId: leader.id, decision: 'APPROVE' }),
      }),
    );
    expect(result).toHaveProperty('message');
  });

  it('RH (privilegiado) pode aprovar PDI de qualquer equipa', async () => {
    mockPrisma.developmentPlan.findUnique.mockResolvedValue({
      id: 1,
      user: { managerId: 999 },
    });
    mockPrisma.developmentPlan.update.mockResolvedValue({
      id: 1,
      userId: 5,
      name: 'PDI Teste',
      user: { id: 5, fullName: 'Colaborador' },
    });

    await expect(service.approvePlan(1, rh)).resolves.toHaveProperty('message');
  });
});
