// src/employees/employees.service.progress.spec.ts
// Cobre métodos não testados: updateContractStatus, logAttendance, getAttendance,
// getFeedback360, createCareerPlan, updatePdiProgress, getPdis, getEmployeeSkills,
// assignSkill, updateSkillLevel, removeSkill, getDocuments, deleteDocument,
// getTimeline, createRequest, getRequests, reviewRequest, bulkUpdateStatus, getOrgChart

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue({ id: 1 }),
  });

  return {
    employee: crud(),
    contract: crud(),
    attendance: crud(),
    feedback360: crud(),
    careerPlan: crud(),
    legacyPdi: { ...crud(), create: jest.fn().mockResolvedValue({ id: 1, actions: [] }) },
    employeeSkill: crud(),
    employeeDocument: crud(),
    employeeTimeline: crud(),
    selfServiceRequest: crud(),
    enrollment: crud(),
    notificationLog: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    user: crud(),
  };
}

const mockAudit = { log: jest.fn().mockResolvedValue({}) };

const baseEmployee = {
  id: 1,
  name: 'Ana Silva',
  email: 'ana@innova.com',
  role: 'Developer',
  department: 'TI',
  status: 'ACTIVE',
  matricula: 'INN2601',
  joinedAt: new Date('2023-01-01'),
  manager: null,
  avatarUrl: null,
  _count: { contracts: 0, feedbacks: 0, careerPlans: 0, pdis: 0, documents: 0, employeeSkills: 0 },
};

describe('EmployeesService (progress)', () => {
  let service: EmployeesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma = buildMockPrisma();

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  // ─── updateContractStatus ─────────────────────────────────────────────────

  describe('updateContractStatus', () => {
    it('deve actualizar status de contrato', async () => {
      mockPrisma.contract.update.mockResolvedValue({ id: 1, status: 'TERMINATED' });
      const result = await service.updateContractStatus(1, 'TERMINATED');
      expect(result).toBeDefined();
      expect(mockPrisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { status: 'TERMINATED' } }),
      );
    });
  });

  // ─── logAttendance ────────────────────────────────────────────────────────

  describe('logAttendance', () => {
    it('deve registar presença com sucesso', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(null);
      mockPrisma.attendance.create.mockResolvedValue({ id: 1, status: 'PRESENT' });
      const result = await service.logAttendance({
        employeeId: 1,
        date: '2026-08-01',
        status: 'PRESENT',
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.attendance.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se já existe presença para essa data', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue({ id: 99 });
      await expect(
        service.logAttendance({ employeeId: 1, date: '2026-08-01', status: 'PRESENT' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── getAttendance ────────────────────────────────────────────────────────

  describe('getAttendance', () => {
    it('deve retornar registos de presença com sumário', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([
        { status: 'PRESENT', hoursWorked: 8 },
        { status: 'ABSENT', hoursWorked: 0 },
      ]);
      const result = (await service.getAttendance(1)) as any;
      expect(result.records).toHaveLength(2);
      expect(result.totalHours).toBe(8);
      expect(result.presentDays).toBe(1);
      expect(result.absentDays).toBe(1);
    });

    it('deve filtrar por intervalo de datas', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([]);
      await service.getAttendance(1, '2026-08-01', '2026-08-31');
      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ employeeId: 1 }) }),
      );
    });
  });

  // ─── getFeedback360 ───────────────────────────────────────────────────────

  describe('getFeedback360', () => {
    it('deve retornar feedbacks com média calculada', async () => {
      mockPrisma.feedback360.findMany.mockResolvedValue([
        { score: 8, cycle: '2026-S1' },
        { score: 6, cycle: '2026-S1' },
      ]);
      const result = (await service.getFeedback360(1)) as any;
      expect(result.feedbacks).toHaveLength(2);
      expect(result.averageScore).toBe(7);
      expect(result.total).toBe(2);
    });

    it('deve retornar média 0 se sem feedbacks', async () => {
      mockPrisma.feedback360.findMany.mockResolvedValue([]);
      const result = (await service.getFeedback360(1)) as any;
      expect(result.averageScore).toBe(0);
    });
  });

  // ─── createCareerPlan ─────────────────────────────────────────────────────

  describe('createCareerPlan', () => {
    it('deve criar plano de carreira', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.careerPlan.create.mockResolvedValue({ id: 1 });
      const result = await service.createCareerPlan({
        employeeId: 1,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        currentRole: 'Developer',
        targetRole: 'Tech Lead',
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.careerPlan.create).toHaveBeenCalled();
    });
  });

  // ─── updatePdiProgress ────────────────────────────────────────────────────

  describe('updatePdiProgress', () => {
    it('deve actualizar progresso do PDI', async () => {
      mockPrisma.legacyPdi.update.mockResolvedValue({ id: 1, progressPercent: 50 });
      const result = await service.updatePdiProgress(1, { progressPercent: 50 } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.legacyPdi.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });

    it('deve marcar PDI como COMPLETED quando progresso é 100%', async () => {
      mockPrisma.legacyPdi.update.mockResolvedValue({
        id: 1,
        progressPercent: 100,
        status: 'COMPLETED',
      });
      await service.updatePdiProgress(1, { progressPercent: 100 } as any);
      expect(mockPrisma.legacyPdi.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });
  });

  // ─── getPdis ──────────────────────────────────────────────────────────────

  describe('getPdis', () => {
    it('deve retornar PDIs do colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.legacyPdi.findMany.mockResolvedValue([{ id: 1, actions: [] }]);
      const result = (await service.getPdis(1)) as any[];
      expect(result).toHaveLength(1);
    });
  });

  // ─── getEmployeeSkills ────────────────────────────────────────────────────

  describe('getEmployeeSkills', () => {
    it('deve retornar competências com análise de gap', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.employeeSkill.findMany.mockResolvedValue([
        {
          id: 1,
          currentLevel: 3,
          desiredLevel: 5,
          skill: { type: 'TECHNICAL', name: 'TypeScript' },
        },
        { id: 2, currentLevel: 4, desiredLevel: 4, skill: { type: 'SOFT', name: 'Comunicação' } },
      ]);
      const result = (await service.getEmployeeSkills(1)) as any;
      expect(result.total).toBe(2);
      expect(result.byType.TECHNICAL).toHaveLength(1);
      expect(result.byType.SOFT).toHaveLength(1);
      expect(result.skills[0].gapLabel).toBe('MODERATE_GAP'); // gap=2
    });

    it('deve retornar ACHIEVED quando gap <= 0', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.employeeSkill.findMany.mockResolvedValue([
        { id: 1, currentLevel: 4, desiredLevel: 4, skill: { type: 'TECHNICAL', name: 'Go' } },
      ]);
      const result = (await service.getEmployeeSkills(1)) as any;
      expect(result.skills[0].gapLabel).toBe('ACHIEVED');
    });
  });

  // ─── assignSkill ──────────────────────────────────────────────────────────

  describe('assignSkill', () => {
    it('deve criar nova competência se não existe', async () => {
      mockPrisma.employeeSkill.findUnique.mockResolvedValue(null);
      mockPrisma.employeeSkill.create.mockResolvedValue({ id: 1 });
      const result = await service.assignSkill({ employeeId: 1, skillId: 5, currentLevel: 3 }, 9);
      expect(mockPrisma.employeeSkill.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('deve actualizar competência existente', async () => {
      mockPrisma.employeeSkill.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.employeeSkill.update.mockResolvedValue({ id: 1, currentLevel: 4 });
      const result = await service.assignSkill({ employeeId: 1, skillId: 5, currentLevel: 4 }, 9);
      expect(mockPrisma.employeeSkill.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ─── updateSkillLevel ─────────────────────────────────────────────────────

  describe('updateSkillLevel', () => {
    it('deve actualizar nível de competência', async () => {
      mockPrisma.employeeSkill.update.mockResolvedValue({ id: 1, currentLevel: 5 });
      const result = await service.updateSkillLevel(1, 5, { currentLevel: 5 });
      expect(result).toBeDefined();
      expect(mockPrisma.employeeSkill.update).toHaveBeenCalled();
    });
  });

  // ─── removeSkill ──────────────────────────────────────────────────────────

  describe('removeSkill', () => {
    it('deve remover competência do colaborador', async () => {
      mockPrisma.employeeSkill.delete.mockResolvedValue({ id: 1 });
      const result = await service.removeSkill(1, 5);
      expect(result).toBeDefined();
      expect(mockPrisma.employeeSkill.delete).toHaveBeenCalled();
    });
  });

  // ─── getDocuments ─────────────────────────────────────────────────────────

  describe('getDocuments', () => {
    it('deve retornar documentos com alertas de expiração', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      const soon = new Date();
      soon.setDate(soon.getDate() + 15); // expira em 15 dias
      const expired = new Date();
      expired.setDate(expired.getDate() - 5); // expirado há 5 dias
      mockPrisma.employeeDocument.findMany.mockResolvedValue([
        { id: 1, title: 'Contrato', expiresAt: soon, status: 'ACTIVE' },
        { id: 2, title: 'Passaporte', expiresAt: expired, status: 'ACTIVE' },
        { id: 3, title: 'CV', expiresAt: null, status: 'ACTIVE' },
      ]);
      const result = (await service.getDocuments(1)) as any;
      expect(result.documents).toHaveLength(3);
      expect(result.expiringSoon).toHaveLength(1);
      expect(result.expired).toHaveLength(1);
    });
  });

  // ─── deleteDocument ───────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('deve marcar documento como eliminado', async () => {
      mockPrisma.employeeDocument.findUnique.mockResolvedValue({ id: 1, title: 'Contrato' });
      mockPrisma.employeeDocument.update.mockResolvedValue({ id: 1, status: 'DELETED' });
      const result = (await service.deleteDocument(1, 9)) as any;
      expect(result.message).toBeDefined();
      expect(mockPrisma.employeeDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ status: 'DELETED' }),
        }),
      );
    });

    it('deve lançar NotFoundException se documento não encontrado', async () => {
      mockPrisma.employeeDocument.findUnique.mockResolvedValue(null);
      await expect(service.deleteDocument(99, 9)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getTimeline ──────────────────────────────────────────────────────────

  describe('getTimeline', () => {
    it('deve retornar timeline do colaborador', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.employeeTimeline.findMany.mockResolvedValue([
        { id: 1, type: 'HIRED', title: 'Admissão', occurredAt: new Date() },
        { id: 2, type: 'PROMOTION', title: 'Promoção', occurredAt: new Date() },
      ]);
      const result = (await service.getTimeline(1)) as any[];
      expect(result).toHaveLength(2);
    });
  });

  // ─── createRequest ────────────────────────────────────────────────────────

  describe('createRequest', () => {
    it('deve criar pedido de self-service', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(baseEmployee);
      mockPrisma.selfServiceRequest.create.mockResolvedValue({ id: 1, status: 'PENDING' });
      const result = await service.createRequest({
        employeeId: 1,
        type: 'DATA_CHANGE',
        subject: 'Actualização de morada',
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.selfServiceRequest.create).toHaveBeenCalled();
    });
  });

  // ─── getRequests ──────────────────────────────────────────────────────────

  describe('getRequests', () => {
    it('deve retornar pedidos de self-service', async () => {
      mockPrisma.selfServiceRequest.findMany.mockResolvedValue([
        { id: 1, status: 'PENDING' },
        { id: 2, status: 'APPROVED' },
      ]);
      const result = (await service.getRequests(1)) as any[];
      expect(result).toHaveLength(2);
    });

    it('deve filtrar por status', async () => {
      mockPrisma.selfServiceRequest.findMany.mockResolvedValue([]);
      await service.getRequests(1, 'PENDING');
      expect(mockPrisma.selfServiceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
      );
    });
  });

  // ─── reviewRequest ────────────────────────────────────────────────────────

  describe('reviewRequest', () => {
    const pendingReq = {
      id: 1,
      employeeId: 5,
      status: 'PENDING',
      type: 'DATA_CHANGE',
      payload: { role: 'Senior Developer' },
    };

    it('deve lançar NotFoundException se pedido não encontrado', async () => {
      mockPrisma.selfServiceRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.reviewRequest(99, { status: 'APPROVED', reviewerId: 1 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se pedido já processado', async () => {
      mockPrisma.selfServiceRequest.findUnique.mockResolvedValue({
        ...pendingReq,
        status: 'APPROVED',
      });
      await expect(
        service.reviewRequest(1, { status: 'APPROVED', reviewerId: 1 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve aprovar DATA_CHANGE e aplicar actualização ao colaborador', async () => {
      mockPrisma.selfServiceRequest.findUnique.mockResolvedValue(pendingReq);
      mockPrisma.selfServiceRequest.update.mockResolvedValue({ ...pendingReq, status: 'APPROVED' });
      mockPrisma.employee.update.mockResolvedValue(baseEmployee);

      await service.reviewRequest(1, { status: 'APPROVED', reviewerId: 9 } as any);

      expect(mockPrisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 } }),
      );
    });

    it('deve rejeitar sem aplicar actualização', async () => {
      mockPrisma.selfServiceRequest.findUnique.mockResolvedValue(pendingReq);
      mockPrisma.selfServiceRequest.update.mockResolvedValue({ ...pendingReq, status: 'REJECTED' });

      await service.reviewRequest(1, { status: 'REJECTED', reviewerId: 9 } as any);

      expect(mockPrisma.employee.update).not.toHaveBeenCalled();
    });
  });

  // ─── bulkUpdateStatus ─────────────────────────────────────────────────────

  describe('bulkUpdateStatus', () => {
    it('deve actualizar status de múltiplos colaboradores', async () => {
      mockPrisma.employee.updateMany.mockResolvedValue({ count: 3 });
      const result = (await service.bulkUpdateStatus(
        { employeeIds: [1, 2, 3], status: 'INACTIVE' } as any,
        9,
      )) as any;
      expect(result).toBeDefined();
      expect(mockPrisma.employee.updateMany).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BULK_STATUS_UPDATE' }),
      );
    });
  });

  // ─── getOrgChart ──────────────────────────────────────────────────────────

  describe('getOrgChart', () => {
    it('deve retornar organograma sem filhos', async () => {
      mockPrisma.employee.findMany
        .mockResolvedValueOnce([
          { id: 1, name: 'CEO', role: 'CEO', managerId: null, _count: { subordinates: 0 } },
        ])
        .mockResolvedValue([]); // children → empty
      const result = (await service.getOrgChart()) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(0);
    });

    it('deve filtrar por rootId', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);
      await service.getOrgChart(5);
      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ managerId: 5 }) }),
      );
    });
  });
});
