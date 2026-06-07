import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Evaluation360Service } from './evaluation360.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const baseCycle = {
  id: 'cycle-1',
  name: 'Ciclo 360 Q1',
  status: 'DRAFT',
  tenantId: 'tenant-1',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-03-31'),
  gracePeriodDays: 3,
  anonymityMode: 'ANONYMOUS',
  quorumMinimum: 3,
  weightSelf: 10,
  weightManager: 40,
  weightPeer: 30,
  weightSubordinate: 20,
  weightExternal: 0,
  linkedToPdi: true,
  linkedToBonus: false,
  cutoffBonus: null,
  cutoffPromotion: null,
  competencies: [],
};

const cycleMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};

const mockPrisma: any = new Proxy(
  {
    evaluationCycle: cycleMock,
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    notificationLog: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-id' }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({ id: 'upsert-id' }),
        count: jest.fn().mockResolvedValue(0),
      };
    },
  },
);

const mockAudit = { log: jest.fn().mockResolvedValue({}) };
const mockEvents = { emit: jest.fn() };
const mockNotifications = { send: jest.fn().mockResolvedValue({}) };

describe('Evaluation360Service (additional)', () => {
  let service: Evaluation360Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    cycleMock.findMany.mockResolvedValue([]);
    cycleMock.count.mockResolvedValue(0);
    cycleMock.findUnique.mockResolvedValue(null);
    cycleMock.create.mockResolvedValue({ ...baseCycle });
    cycleMock.update.mockResolvedValue({ ...baseCycle });
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Evaluation360Service,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();
    service = module.get<Evaluation360Service>(Evaluation360Service);
  });

  // ─── createCycle ──────────────────────────────────────────────────────────

  describe('createCycle', () => {
    it('deve rejeitar se soma de pesos != 100', async () => {
      await expect(
        service.createCycle(
          {
            name: 'Ciclo Inválido',
            tenantId: 'tenant-1',
            startDate: '2026-01-01',
            endDate: '2026-03-31',
            weightSelf: 50,
            weightManager: 50,
            weightPeer: 50,
            weightSubordinate: 0,
            weightExternal: 0,
          } as any,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar se data de início >= data de fim', async () => {
      await expect(
        service.createCycle(
          {
            name: 'Ciclo Datas Inválidas',
            tenantId: 'tenant-1',
            startDate: '2026-03-31',
            endDate: '2026-01-01',
            weightSelf: 10,
            weightManager: 40,
            weightPeer: 30,
            weightSubordinate: 20,
            weightExternal: 0,
          } as any,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve criar ciclo com competências', async () => {
      cycleMock.create.mockResolvedValue({ ...baseCycle, competencies: [{ competencyId: 'c1', weight: 1 }] });
      const result = await service.createCycle(
        {
          name: 'Ciclo com Competências',
          tenantId: 'tenant-1',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          weightSelf: 10,
          weightManager: 40,
          weightPeer: 30,
          weightSubordinate: 20,
          weightExternal: 0,
          competencies: [{ competencyId: 'c1', weight: 1, isRequired: true, order: 1 }],
        } as any,
        'user-1',
      );
      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entity: 'EvaluationCycle' }));
    });
  });

  // ─── updateCycle ──────────────────────────────────────────────────────────

  describe('updateCycle', () => {
    it('deve actualizar ciclo em DRAFT', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'DRAFT' });
      cycleMock.update.mockResolvedValue({ ...baseCycle, name: 'Actualizado' });
      const result = await service.updateCycle('cycle-1', { name: 'Actualizado' } as any, 'user-1');
      expect(result).toBeDefined();
    });

    it('deve rejeitar update de ciclo IN_PROGRESS', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'IN_PROGRESS' });
      await expect(service.updateCycle('cycle-1', { name: 'X' } as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar update de ciclo COMPLETED', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'COMPLETED' });
      await expect(service.updateCycle('cycle-1', { name: 'X' } as any, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar pesos inválidos no update', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'DRAFT' });
      await expect(
        service.updateCycle(
          'cycle-1',
          { weightSelf: 60, weightManager: 60, weightPeer: 0, weightSubordinate: 0, weightExternal: 0 } as any,
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se ciclo não existe', async () => {
      cycleMock.findUnique.mockResolvedValue(null);
      await expect(service.updateCycle('invalid', {}, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publishCycle ─────────────────────────────────────────────────────────

  describe('publishCycle', () => {
    it('deve rejeitar se ciclo não está em DRAFT', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'PUBLISHED' });
      await expect(service.publishCycle('cycle-1', {}, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar se não há participantes', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'DRAFT' });
      // cycleParticipant.count returns 0 (default)
      await expect(service.publishCycle('cycle-1', {}, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('deve rejeitar se não há questões', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'DRAFT' });
      // Override: participant count > 0, question count = 0
      mockPrisma.cycleParticipant = { count: jest.fn().mockResolvedValue(5), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.evaluationQuestion = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() };
      await expect(service.publishCycle('cycle-1', {}, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('deve publicar ciclo com participantes e questões', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'DRAFT' });
      cycleMock.update.mockResolvedValue({ ...baseCycle, status: 'PUBLISHED' });
      mockPrisma.cycleParticipant = { count: jest.fn().mockResolvedValue(5), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.evaluationQuestion = { count: jest.fn().mockResolvedValue(3), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() };
      const result = await service.publishCycle('cycle-1', { sendInvitesNow: false }, 'user-1');
      expect(result).toBeDefined();
      expect(mockEvents.emit).toHaveBeenCalledWith('cycle.published', expect.any(Object));
    });

    it('deve publicar e enviar convites imediatamente', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, status: 'DRAFT' });
      cycleMock.update.mockResolvedValue({ ...baseCycle, status: 'PUBLISHED' });
      mockPrisma.cycleParticipant = { count: jest.fn().mockResolvedValue(5), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
      mockPrisma.evaluationQuestion = { count: jest.fn().mockResolvedValue(2), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() };
      mockPrisma.evaluatorAssignment = {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      const result = await service.publishCycle('cycle-1', { sendInvitesNow: true }, 'user-1');
      expect(result).toBeDefined();
    });
  });

  // ─── giveConsent ──────────────────────────────────────────────────────────

  describe('giveConsent', () => {
    it('deve registar consentimento', async () => {
      mockPrisma.cycleParticipant = {
        findUnique: jest.fn().mockResolvedValue({ cycleId: 'c1', userId: 'u1', consentGiven: false }),
        update: jest.fn().mockResolvedValue({ consentGiven: true }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      const result = await service.giveConsent('cycle-1', 'user-1', { consent: true });
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se participante não existe', async () => {
      mockPrisma.cycleParticipant = {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      await expect(service.giveConsent('cycle-1', 'user-x', { consent: false })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── suggestEvaluators ────────────────────────────────────────────────────

  describe('suggestEvaluators', () => {
    it('deve sugerir avaliadores (com manager e departamento)', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        managerId: 'mgr-1',
        departmentId: 'dept-1',
      });
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'peer-1' },
        { id: 'sub-1' },
      ]);
      const result = await service.suggestEvaluators('cycle-1', { evaluateeId: 'user-1' });
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(s => s.role === 'SELF')).toBe(true);
      expect(result.some(s => s.role === 'MANAGER')).toBe(true);
    });

    it('deve sugerir apenas autoavaliação se sem manager ou departamento', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', managerId: null, departmentId: null });
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.suggestEvaluators('cycle-1', { evaluateeId: 'user-1' });
      expect(result.some(s => s.role === 'SELF')).toBe(true);
    });

    it('deve lançar NotFoundException se avaliado não existe', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.suggestEvaluators('cycle-1', { evaluateeId: 'ghost' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignEvaluators ────────────────────────────────────────────────────

  describe('assignEvaluators', () => {
    it('deve atribuir avaliadores com sucesso', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.evaluatorAssignment = {
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      const result = await service.assignEvaluators(
        'cycle-1',
        { assignments: [{ evaluatorId: 'mgr-1', evaluateeId: 'user-1', role: 'MANAGER' as any }] },
        'admin-1',
      );
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('deve registar erro quando avaliador === avaliado com role != SELF', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      const result = await service.assignEvaluators(
        'cycle-1',
        { assignments: [{ evaluatorId: 'user-1', evaluateeId: 'user-1', role: 'MANAGER' as any }] },
        'admin-1',
      );
      expect(result.errors).toHaveLength(1);
      expect(result.created).toBe(0);
    });

    it('deve permitir autoavaliação (SELF role)', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.evaluatorAssignment = {
        create: jest.fn().mockResolvedValue({ id: 'a2' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      const result = await service.assignEvaluators(
        'cycle-1',
        { assignments: [{ evaluatorId: 'user-1', evaluateeId: 'user-1', role: 'SELF' as any }] },
        'admin-1',
      );
      expect(result.created).toBe(1);
    });
  });

  // ─── approveEvaluators ───────────────────────────────────────────────────

  describe('approveEvaluators', () => {
    it('deve aprovar avaliadores e emitir eventos de convite', async () => {
      mockPrisma.evaluatorAssignment = {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'a1', evaluatorId: 'u1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.approveEvaluators('cycle-1', { assignmentIds: ['a1', 'a2'] }, 'admin-1');
      expect(result.approved).toBe(2);
      expect(mockEvents.emit).toHaveBeenCalledWith('evaluation.invitation.send', expect.any(Object));
    });
  });

  // ─── sendCycleInvites ────────────────────────────────────────────────────

  describe('sendCycleInvites', () => {
    it('deve enviar convites para assignments pendentes', async () => {
      mockPrisma.evaluatorAssignment = {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      };
      const result = await service.sendCycleInvites('cycle-1', 'admin-1');
      expect(result.sent).toBe(2);
      expect(mockEvents.emit).toHaveBeenCalledWith('evaluation.invitation.send', expect.any(Object));
    });

    it('deve retornar 0 se não há assignments pendentes', async () => {
      mockPrisma.evaluatorAssignment = {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      };
      const result = await service.sendCycleInvites('cycle-1', 'admin-1');
      expect(result.sent).toBe(0);
    });
  });

  // ─── sendReminders ───────────────────────────────────────────────────────

  describe('sendReminders', () => {
    it('deve enviar lembretes a assignments com status INVITED ou IN_PROGRESS', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.evaluatorAssignment = {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      };
      const result = await service.sendReminders('cycle-1', { channels: ['EMAIL'] }, 'admin-1');
      expect(result.reminded).toBe(2);
      expect(mockEvents.emit).toHaveBeenCalledWith('evaluation.reminder.send', expect.any(Object));
    });

    it('deve filtrar por assignmentIds específicos', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.evaluatorAssignment = {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      };
      const result = await service.sendReminders('cycle-1', { assignmentIds: ['a1'] }, 'admin-1');
      expect(result.reminded).toBe(1);
    });
  });

  // ─── getEvaluationForm ────────────────────────────────────────────────────

  describe('getEvaluationForm', () => {
    it('deve lançar NotFoundException se assignment não existe', async () => {
      mockPrisma.evaluatorAssignment = {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      await expect(service.getEvaluationForm('cycle-1', 'user-1', 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se avaliação expirada', async () => {
      mockPrisma.evaluatorAssignment = {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1', status: 'EXPIRED', role: 'PEER' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      await expect(service.getEvaluationForm('cycle-1', 'user-1', 'user-2')).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se avaliação já submetida', async () => {
      mockPrisma.evaluatorAssignment = {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1', status: 'COMPLETED', role: 'PEER' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      await expect(service.getEvaluationForm('cycle-1', 'user-1', 'user-2')).rejects.toThrow(BadRequestException);
    });

    it('deve retornar formulário de avaliação', async () => {
      mockPrisma.evaluatorAssignment = {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1', status: 'INVITED', role: 'PEER' }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, competencies: [] });
      mockPrisma.evaluationQuestion = {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      };
      mockPrisma.evaluationResponse = {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      const result = await service.getEvaluationForm('cycle-1', 'user-1', 'user-2');
      expect(result).toHaveProperty('assignment');
      expect(result).toHaveProperty('cycle');
    });
  });

  // ─── submitResponse ───────────────────────────────────────────────────────

  describe('submitResponse', () => {
    it('deve lançar NotFoundException se assignment não existe', async () => {
      mockPrisma.evaluatorAssignment = {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      await expect(
        service.submitResponse('cycle-1', 'user-1', 'user-2', { submit: false, answers: [] }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se já submetida', async () => {
      mockPrisma.evaluatorAssignment = {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1', status: 'COMPLETED', role: 'PEER' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      await expect(
        service.submitResponse('cycle-1', 'user-1', 'user-2', { submit: true, answers: [] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve gravar rascunho sem submeter', async () => {
      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      mockPrisma.evaluatorAssignment = {
        findFirst: jest.fn().mockResolvedValue({ id: 'a1', status: 'INVITED', role: 'PEER' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, endDate: futureDate });
      mockPrisma.evaluationQuestion = {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      };
      mockPrisma.evaluationResponse = {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'resp-1', status: 'DRAFT' }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      mockPrisma.evaluationAnswer = {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      };
      const result = await service.submitResponse(
        'cycle-1', 'user-1', 'user-2',
        { submit: false, answers: [] },
        'user-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── calculateCycleResults ────────────────────────────────────────────────

  describe('calculateCycleResults', () => {
    it('deve lançar NotFoundException se ciclo não existe', async () => {
      cycleMock.findUnique.mockResolvedValue(null);
      await expect(service.calculateCycleResults('invalid', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('deve calcular resultados sem participantes', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, competencies: [] });
      cycleMock.update.mockResolvedValue({ ...baseCycle, status: 'COMPLETED' });
      mockPrisma.cycleParticipant = {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.calculateCycleResults('cycle-1', 'admin-1');
      expect(result.processed).toBe(0);
      expect(mockEvents.emit).toHaveBeenCalledWith('cycle.results.ready', expect.any(Object));
    });
  });

  // ─── getParticipantResult ─────────────────────────────────────────────────

  describe('getParticipantResult', () => {
    it('deve retornar resultado para ADMIN', async () => {
      mockPrisma.evaluationResult = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          cycleId: 'cycle-1',
          participantId: 'user-2',
          overallScore: 4.2,
          weightedScore: 4.0,
          scoresByCompetency: '{}',
          gaps: '[]',
          strengths: '[]',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      };
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      const result = await service.getParticipantResult('cycle-1', 'user-2', 'admin-1', 'ADMIN');
      expect(result.overallScore).toBe(4.2);
      expect(result.rawByEvaluator).toBeDefined();
    });

    it('deve retornar resultado para o próprio utilizador', async () => {
      mockPrisma.evaluationResult = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          cycleId: 'cycle-1',
          participantId: 'user-1',
          overallScore: 3.5,
          weightedScore: 3.8,
          scoresByCompetency: '{}',
          gaps: '[]',
          strengths: '[]',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      };
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      const result = await service.getParticipantResult('cycle-1', 'user-1', 'user-1', 'EMPLOYEE');
      expect(result).toBeDefined();
      expect(result.rawByEvaluator).toBeNull();
    });

    it('deve lançar ForbiddenException se EMPLOYEE tentar ver resultado de outro', async () => {
      mockPrisma.evaluationResult = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          cycleId: 'cycle-1',
          participantId: 'user-2',
          overallScore: 4.0,
          weightedScore: 4.0,
          scoresByCompetency: '{}',
          gaps: '[]',
          strengths: '[]',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      };
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      await expect(
        service.getParticipantResult('cycle-1', 'user-2', 'user-3', 'EMPLOYEE'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getTeamAnalytics ─────────────────────────────────────────────────────

  describe('getTeamAnalytics', () => {
    it('deve retornar analytics de equipa com scores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', fullName: 'Alice' },
        { id: 'u2', fullName: 'Bob' },
      ]);
      mockPrisma.evaluationResult = {
        findMany: jest.fn().mockResolvedValue([
          { participantId: 'u1', weightedScore: 4.0, overallScore: 3.8, isEligiblePromotion: true, isEligibleBonus: false, gaps: '[]', strengths: '[]' },
          { participantId: 'u2', weightedScore: 3.2, overallScore: 3.5, isEligiblePromotion: false, isEligibleBonus: true, gaps: '[]', strengths: '[]' },
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.getTeamAnalytics('cycle-1', 'mgr-1');
      expect(result).toHaveLength(2);
      expect(result[0].participantName).toBe('Alice');
    });
  });

  // ─── getOrganizationalAnalytics ───────────────────────────────────────────

  describe('getOrganizationalAnalytics', () => {
    it('deve calcular média organizacional', async () => {
      mockPrisma.evaluationResult = {
        findMany: jest.fn().mockResolvedValue([
          { overallScore: 4.0, weightedScore: 4.0, scoresByCompetency: '{"c1":{"score":4.0}}', isEligiblePromotion: true },
          { overallScore: 3.0, weightedScore: 3.5, scoresByCompetency: '{"c1":{"score":3.5}}', isEligiblePromotion: false },
        ]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.getOrganizationalAnalytics({ cycleId: 'cycle-1' } as any);
      expect(result.totalParticipants).toBe(2);
      expect(result.avgOverall).toBeCloseTo(3.5);
      expect(result.eligiblePromotion).toBe(1);
    });

    it('deve retornar 0 quando sem resultados', async () => {
      mockPrisma.evaluationResult = {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.getOrganizationalAnalytics({} as any);
      expect(result.totalParticipants).toBe(0);
      expect(result.avgOverall).toBe(0);
    });
  });

  // ─── getNineBox ───────────────────────────────────────────────────────────

  describe('getNineBox', () => {
    it('deve classificar participantes no nine-box', async () => {
      mockPrisma.evaluationResult = {
        findMany: jest.fn()
          .mockResolvedValueOnce([
            { participantId: 'u1', weightedScore: 4.5 },
            { participantId: 'u2', weightedScore: 2.0 },
          ])
          .mockResolvedValueOnce([
            { participantId: 'u1', weightedScore: 4.5, selfScore: 4.0 },
            { participantId: 'u2', weightedScore: 2.0, selfScore: 2.5 },
          ]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.getNineBox({ cycleId: 'cycle-1' } as any);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('box');
    });
  });

  // ─── calibrateScore ───────────────────────────────────────────────────────

  describe('calibrateScore', () => {
    it('deve calibrar score com sucesso', async () => {
      mockPrisma.evaluationResult = {
        findFirst: jest.fn().mockResolvedValue({ id: 'r1', weightedScore: 3.5 }),
        update: jest.fn().mockResolvedValue({ id: 'r1', weightedScore: 4.0 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      };
      const result = await service.calibrateScore(
        'cycle-1',
        { participantId: 'user-1', calibratedScore: 4.0, justification: 'Boa performance' },
        'rh-1',
      );
      expect(result.newScore).toBe(4.0);
    });

    it('deve lançar NotFoundException se resultado não existe', async () => {
      mockPrisma.evaluationResult = {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      };
      await expect(
        service.calibrateScore('cycle-1', { participantId: 'ghost', calibratedScore: 4.0, justification: 'N/A' }, 'rh-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── generateReport ───────────────────────────────────────────────────────

  describe('generateReport', () => {
    it('deve gerar relatório individual', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, name: 'Ciclo Q1' });
      mockPrisma.evaluationResult = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          scoresByCompetency: '{}',
          gaps: '[]',
          strengths: '[]',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.generateReport(
        { cycleId: 'cycle-1', scope: 'INDIVIDUAL', participantId: 'user-1', includeAiInsights: false },
        'admin-1',
      );
      expect(result).toHaveProperty('scope', 'INDIVIDUAL');
    });

    it('deve gerar relatório organizacional por omissão', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.evaluationResult = {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.generateReport({ cycleId: 'cycle-1', scope: 'TEAM' }, 'admin-1');
      expect(result).toHaveProperty('totalParticipants');
    });

    it('deve lançar NotFoundException para relatório individual sem resultado', async () => {
      cycleMock.findUnique.mockResolvedValue(baseCycle);
      mockPrisma.evaluationResult = {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      await expect(
        service.generateReport({ cycleId: 'cycle-1', scope: 'INDIVIDUAL', participantId: 'ghost' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve incluir AI insights quando solicitado', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...baseCycle, name: 'Ciclo Q1' });
      mockPrisma.evaluationResult = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'r1',
          scoresByCompetency: '{}',
          gaps: '[{"name":"Liderança"}]',
          strengths: '[{"name":"Comunicação"}]',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      };
      const result = await service.generateReport(
        { cycleId: 'cycle-1', scope: 'INDIVIDUAL', participantId: 'user-1', includeAiInsights: true },
        'admin-1',
      );
      expect(result).toHaveProperty('aiInsights');
      expect(typeof (result as any).aiInsights).toBe('string');
    });
  });

  // ─── listFeedbackForUser ──────────────────────────────────────────────────

  describe('listFeedbackForUser', () => {
    it('deve listar feedback para utilizador', async () => {
      mockPrisma.continuousFeedback = {
        findMany: jest.fn().mockResolvedValue([{ id: 'f1', message: 'Bom trabalho' }]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      };
      const result = await service.listFeedbackForUser('user-1', { offset: 0, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ─── submitPulseSurveyResponse ───────────────────────────────────────────

  describe('submitPulseSurveyResponse', () => {
    it('deve submeter resposta a pulse survey', async () => {
      mockPrisma.pulseSurveyResponse = {
        upsert: jest.fn().mockResolvedValue({ surveyId: 's1', userId: 'u1', answersJson: '{}' }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      };
      const result = await service.submitPulseSurveyResponse('survey-1', 'user-1', { answersJson: '{"q1":5}' });
      expect(result).toBeDefined();
    });
  });
});
