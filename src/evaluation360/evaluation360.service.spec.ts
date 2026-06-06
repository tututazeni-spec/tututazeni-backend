import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Evaluation360Service } from './evaluation360.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const competencyMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};
const cycleMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};
const questionMock = {
  create: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  delete: jest.fn(),
};
const requestMock = {
  create: jest.fn(),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};

const mockPrisma = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'competency') return competencyMock;
      if (prop === 'evaluationCycle') return cycleMock;
      if (prop === 'cycleQuestion') return questionMock;
      if (prop === 'evaluationRequest') return requestMock;
      return {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      };
    },
  },
);

const mockAudit = { log: jest.fn().mockResolvedValue({}) };
const mockEvents = { emit: jest.fn() };

const baseCompetency = { id: 'comp-1', name: 'Comunicação', type: 'BEHAVIORAL', indicators: [] };

describe('Evaluation360Service', () => {
  let service: Evaluation360Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Evaluation360Service,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: { send: jest.fn().mockResolvedValue({}) } },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();
    service = module.get<Evaluation360Service>(Evaluation360Service);
  });

  describe('createCompetency', () => {
    it('deve criar competência 360', async () => {
      competencyMock.create.mockResolvedValue(baseCompetency);
      const result = await service.createCompetency(
        { name: 'Comunicação', type: 'BEHAVIORAL' } as any,
        'user-1',
      );
      expect(result.name).toBe('Comunicação');
    });
  });

  describe('listCompetencies', () => {
    it('deve listar competências', async () => {
      competencyMock.findMany.mockResolvedValue([baseCompetency]);
      competencyMock.count.mockResolvedValue(1);
      const result = await service.listCompetencies();
      expect(result).toBeDefined();
    });
  });

  describe('updateCompetency', () => {
    it('deve actualizar competência', async () => {
      competencyMock.findUnique.mockResolvedValue(baseCompetency);
      competencyMock.update.mockResolvedValue({ ...baseCompetency, name: 'Actualizado' });
      const result = await service.updateCompetency(
        'comp-1',
        { name: 'Actualizado' } as any,
        'user-1',
      );
      expect(result.name).toBe('Actualizado');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      competencyMock.findUnique.mockResolvedValue(null);
      await expect(service.updateCompetency('x', {}, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createCycle ──────────────────────────────────────────────────────────

  describe('createCycle', () => {
    it('deve criar ciclo 360', async () => {
      cycleMock.create.mockResolvedValue({
        id: 'cycle-1',
        name: 'Ciclo 360 2024',
        status: 'DRAFT',
      });
      const result = await service.createCycle(
        {
          name: 'Ciclo 360 2024',
          tenantId: 'tenant-1',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(),
          weightSelf: 10,
          weightManager: 40,
          weightPeer: 30,
          weightSubordinate: 20,
          weightExternal: 0,
        } as any,
        'user-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── listCycles ───────────────────────────────────────────────────────────

  describe('listCycles', () => {
    it('deve listar ciclos por tenant', async () => {
      cycleMock.findMany.mockResolvedValue([]);
      cycleMock.count.mockResolvedValue(0);
      const result = await service.listCycles('tenant-1', { offset: 0, limit: 20 });
      expect(result).toBeDefined();
    });
  });

  // ─── getCycleDetail ───────────────────────────────────────────────────────

  describe('getCycleDetail', () => {
    it('deve retornar detalhe do ciclo', async () => {
      cycleMock.findUnique.mockResolvedValue({
        id: 'cycle-1',
        name: 'Ciclo 360 2024',
        status: 'DRAFT',
        participants: [],
        questions: [],
      });
      const result = await service.getCycleDetail('cycle-1');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      cycleMock.findUnique.mockResolvedValue(null);
      await expect(service.getCycleDetail('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createQuestion ───────────────────────────────────────────────────────

  describe('createQuestion', () => {
    it('deve criar questão para o ciclo', async () => {
      questionMock.create.mockResolvedValue({ id: 'q-1', text: 'Como avalia a comunicação?' });
      const result = await service.createQuestion(
        { cycleId: 'cycle-1', text: 'Como avalia a comunicação?', type: 'RATING' } as any,
        'user-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── listQuestions ────────────────────────────────────────────────────────

  describe('listQuestions', () => {
    it('deve listar questões', async () => {
      questionMock.findMany.mockResolvedValue([]);
      const result = await service.listQuestions('cycle-1');
      expect(result).toBeDefined();
    });
  });

  // ─── addParticipants ──────────────────────────────────────────────────────

  describe('addParticipants', () => {
    it('deve adicionar participantes ao ciclo', async () => {
      cycleMock.findUnique.mockResolvedValue({ id: 'cycle-1', status: 'DRAFT' });
      requestMock.createMany.mockResolvedValue({ count: 2 });
      const result = await service.addParticipants(
        'cycle-1',
        { userIds: ['user-1', 'user-2'] } as any,
        'admin-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getParticipantProgress ───────────────────────────────────────────────

  describe('getParticipantProgress', () => {
    it('deve retornar progresso do participante', async () => {
      requestMock.findMany.mockResolvedValue([]);
      requestMock.count.mockResolvedValue(0);
      const result = await service.getParticipantProgress('cycle-1', 'user-1');
      expect(result).toBeDefined();
    });
  });

  // ─── getParticipantResult ─────────────────────────────────────────────────

  describe('getParticipantResult', () => {
    it('deve lançar NotFoundException se resultado não existe', async () => {
      await expect(
        service.getParticipantResult('cycle-1', 'user-1', 'admin-1', 'ADMIN'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getTeamAnalytics ─────────────────────────────────────────────────────

  describe('getTeamAnalytics', () => {
    it('deve retornar analytics da equipa', async () => {
      cycleMock.findUnique.mockResolvedValue({
        id: 'cycle-1',
        status: 'COMPLETED',
        participants: [],
      });
      const result = await service.getTeamAnalytics('cycle-1', 'manager-1');
      expect(result).toBeDefined();
    });
  });

  // ─── getOrganizationalAnalytics ───────────────────────────────────────────

  describe('getOrganizationalAnalytics', () => {
    it('deve retornar analytics organizacionais', async () => {
      cycleMock.findMany.mockResolvedValue([]);
      const result = await service.getOrganizationalAnalytics({ page: 1, limit: 20 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getNineBox ───────────────────────────────────────────────────────────

  describe('getNineBox', () => {
    it('deve retornar nine-box grid', async () => {
      cycleMock.findMany.mockResolvedValue([]);
      const result = await service.getNineBox({ tenantId: 'tenant-1' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── createContinuousFeedback ─────────────────────────────────────────────

  describe('createContinuousFeedback', () => {
    it('deve criar feedback contínuo', async () => {
      const result = await service.createContinuousFeedback(
        { toUserId: 'user-2', message: 'Bom trabalho', type: 'POSITIVE' } as any,
        'user-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── createPulseSurvey ────────────────────────────────────────────────────

  describe('createPulseSurvey', () => {
    it('deve criar pulse survey', async () => {
      const result = await service.createPulseSurvey(
        { title: 'Pulse Semanal', questions: [] } as any,
        'admin-1',
      );
      expect(result).toBeDefined();
    });
  });
});
