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

const mockPrisma = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'competency') return competencyMock;
    if (prop === 'evaluationCycle') return cycleMock;
    if (prop === 'cycleQuestion') return questionMock;
    if (prop === 'evaluationRequest') return requestMock;
    return { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0), findUnique: jest.fn() };
  },
});

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
      const result = await service.createCompetency({ name: 'Comunicação', type: 'BEHAVIORAL' } as any, 'user-1');
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
      const result = await service.updateCompetency('comp-1', { name: 'Actualizado' } as any, 'user-1');
      expect(result.name).toBe('Actualizado');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      competencyMock.findUnique.mockResolvedValue(null);
      await expect(service.updateCompetency('x', {}, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
