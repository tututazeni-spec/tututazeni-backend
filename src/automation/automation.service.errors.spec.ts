import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  automationRule: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  },
  automationExecution: { findUnique: jest.fn() },
};

describe('AutomationService — toggleRule / cloneRule / rerunExecution', () => {
  let service: AutomationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutomationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AutomationService>(AutomationService);
  });

  it('toggleRule com regra inexistente → NotFoundException', async () => {
    mockPrisma.automationRule.findUnique.mockResolvedValue(null);
    await expect(service.toggleRule(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('toggleRule inverte o estado activo da regra', async () => {
    mockPrisma.automationRule.findUnique.mockResolvedValue({ id: 1, active: true });
    mockPrisma.automationRule.update.mockResolvedValue({ id: 1, active: false });
    await service.toggleRule(1);
    expect(mockPrisma.automationRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
  });

  it('cloneRule cria uma cópia inactiva com nome prefixado', async () => {
    mockPrisma.automationRule.findUnique.mockResolvedValue({
      id: 1,
      name: 'Regra Original',
      active: true,
      category: 'HR',
    });
    mockPrisma.automationRule.create.mockResolvedValue({ id: 2, name: 'Cópia de: Regra Original' });

    await service.cloneRule(1);

    expect(mockPrisma.automationRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Cópia de: Regra Original', active: false }),
      }),
    );
  });

  it('rerunExecution devolve mensagem se a execução não existe', async () => {
    mockPrisma.automationExecution.findUnique.mockResolvedValue(null);
    const result = await service.rerunExecution(999);
    expect(result).toEqual({ message: 'Execução não encontrada' });
  });

  it('rerunExecution devolve mensagem se a regra associada já não existe', async () => {
    mockPrisma.automationExecution.findUnique.mockResolvedValue({
      id: 1,
      ruleId: 5,
      payload: '{}',
    });
    mockPrisma.automationRule.findUnique.mockResolvedValue(null);
    const result = await service.rerunExecution(1);
    expect(result).toEqual({ message: 'Regra não encontrada' });
  });

  it('rerunExecution reexecuta a acção da regra com o payload original', async () => {
    mockPrisma.automationExecution.findUnique.mockResolvedValue({
      id: 1,
      ruleId: 5,
      payload: JSON.stringify({ userId: 42, foo: 'bar' }),
    });
    mockPrisma.automationRule.findUnique.mockResolvedValue({ id: 5, name: 'Regra' });
    const spy = jest.spyOn(service as any, 'executeAction').mockResolvedValue({ ok: true });

    const result = await service.rerunExecution(1);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
      { userId: 42, foo: 'bar' },
      42,
    );
    expect(result).toEqual({ ok: true });
  });
});
