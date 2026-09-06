import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LeaderService } from './leader.service';
import { PrismaService } from '../prisma/prisma.service';
import { DevelopmentPlansService } from '../development-plans/development-plans.service';
import { OneOnOneService } from '../one-on-one/one-on-one.service';

const mockPrisma = {
  developmentPlan: { findUnique: jest.fn(), update: jest.fn() },
  pdiApproval: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const mockDevelopmentPlans = { approvePlan: jest.fn() };

const leader = { id: 10, role: { name: 'LIDER' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

describe('LeaderService.approvePlan — delegação (Fase G3)', () => {
  let service: LeaderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DevelopmentPlansService, useValue: mockDevelopmentPlans },
        {
          provide: OneOnOneService,
          useValue: {
            schedule: jest.fn(),
            getOne: jest.fn(),
            listForUser: jest.fn(),
            complete: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get<LeaderService>(LeaderService);
  });

  it('delega em DevelopmentPlansService.approvePlan com decision=approve', async () => {
    mockDevelopmentPlans.approvePlan.mockResolvedValue({ id: 1, status: 'ACTIVE', name: 'PDI' });
    const result = await service.approvePlan(1, leader);
    expect(mockDevelopmentPlans.approvePlan).toHaveBeenCalledWith(
      { planId: 1, decision: 'approve' },
      leader,
    );
    expect(result).toEqual({ message: 'PDI aprovado', plan: expect.objectContaining({ id: 1 }) });
  });

  it('propaga o erro de ownership do canónico (aprovador sem autoridade) → NotFoundException', async () => {
    mockDevelopmentPlans.approvePlan.mockRejectedValue(
      new NotFoundException('Recurso não encontrado'),
    );
    await expect(service.approvePlan(1, leader)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RH (privilegiado) — a decisão de autoridade é do canónico; delega na mesma', async () => {
    mockDevelopmentPlans.approvePlan.mockResolvedValue({ id: 1, status: 'ACTIVE' });
    await expect(service.approvePlan(1, rh)).resolves.toHaveProperty('message', 'PDI aprovado');
  });
});
