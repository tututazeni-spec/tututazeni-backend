import { Test, TestingModule } from '@nestjs/testing';
import { AcademicService } from './academic.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

const mockProgram = {
  id: 'prog-1',
  code: 'PROG-001',
  name: 'Liderança',
  level: 'BASIC',
  durationHours: 40,
  passingScore: 60,
  prerequisites: [],
  isMandatory: false,
  deletedAt: null,
};
const mockEnrollment = {
  id: 'enr-1',
  code: 'MAT-00001',
  userId: 1,
  programId: 'prog-1',
  status: 'IN_PROGRESS',
  program: mockProgram,
};

const mockPrisma = {
  academicYear: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  academicPeriod: { create: jest.fn() },
  academicProgram: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  academicClass: { create: jest.fn(), findUnique: jest.fn() },
  academicEnrollment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  academicGrade: { create: jest.fn(), findMany: jest.fn() },
  academicTranscript: { findUnique: jest.fn(), upsert: jest.fn() },
  auditLog: { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('AcademicService', () => {
  let service: AcademicService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AcademicService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AcademicService>(AcademicService);
    jest.clearAllMocks();
  });

  describe('createYear', () => {
    it('deve criar ano e desactivar outros se isCurrent', async () => {
      mockPrisma.academicYear.updateMany.mockResolvedValue({});
      mockPrisma.academicYear.create.mockResolvedValue({
        id: 'y1',
        name: '2025/2026',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createYear(
        {
          name: '2025/2026',
          startDate: '2025-09-01',
          endDate: '2026-07-31',
          isCurrent: true,
        },
        1,
      );
      expect(result.name).toBe('2025/2026');
      expect(mockPrisma.academicYear.updateMany).toHaveBeenCalled();
    });
  });

  describe('createPeriod', () => {
    it('deve lançar NotFoundException se ano não existir', async () => {
      mockPrisma.academicYear.findUnique.mockResolvedValue(null);
      await expect(
        service.createPeriod(
          {
            yearId: 'nao-existe',
            name: '1S',
            startDate: '2025-09-01',
            endDate: '2026-01-31',
          },
          1,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createProgram', () => {
    it('deve criar programa com código único', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(null);
      mockPrisma.academicProgram.create.mockResolvedValue(mockProgram);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createProgram(
        { code: 'PROG-001', name: 'Liderança', durationHours: 40 },
        1,
      );
      expect(result.code).toBe('PROG-001');
    });

    it('deve lançar ConflictException se código já existe', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(mockProgram);
      await expect(
        service.createProgram({ code: 'PROG-001', name: 'X', durationHours: 10 }, 1),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('enroll', () => {
    it('deve matricular aluno com código MAT-', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.academicEnrollment.findFirst.mockResolvedValue(null);
      mockPrisma.academicEnrollment.create.mockResolvedValue(mockEnrollment);
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.enroll({ userId: 1, programId: 'prog-1' }, 2);
      expect(result.code).toBe('MAT-00001');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'ACADEMIC_ENROLLMENT' }),
        }),
      );
    });

    it('deve lançar ConflictException se já matriculado', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.academicEnrollment.findFirst.mockResolvedValue(mockEnrollment);
      await expect(service.enroll({ userId: 1, programId: 'prog-1' }, 2)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve lançar BadRequestException se pré-requisitos não cumpridos', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue({
        ...mockProgram,
        prerequisites: ['prog-0'],
      });
      mockPrisma.academicEnrollment.count.mockResolvedValue(0);
      await expect(service.enroll({ userId: 1, programId: 'prog-1' }, 2)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approveEnrollment', () => {
    it('deve aprovar matrícula pendente', async () => {
      mockPrisma.academicEnrollment.findUnique.mockResolvedValue({
        ...mockEnrollment,
        status: 'PENDING',
      });
      mockPrisma.academicEnrollment.update.mockResolvedValue({
        ...mockEnrollment,
        status: 'APPROVED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.approveEnrollment('enr-1', 2);
      expect(result.status).toBe('APPROVED');
    });

    it('deve lançar BadRequestException se não está pendente', async () => {
      mockPrisma.academicEnrollment.findUnique.mockResolvedValue(mockEnrollment);
      await expect(service.approveEnrollment('enr-1', 2)).rejects.toThrow(BadRequestException);
    });
  });

  describe('gradeEnrollment', () => {
    it('deve lançar nota e marcar COMPLETED se passou', async () => {
      mockPrisma.academicEnrollment.findUnique.mockResolvedValue(mockEnrollment);
      mockPrisma.academicGrade.create.mockResolvedValue({ id: 'g1', score: 80 });
      mockPrisma.academicGrade.findMany.mockResolvedValue([
        { score: 80, maxScore: 100, weight: 1 },
      ]);
      mockPrisma.academicEnrollment.update.mockResolvedValue({});
      mockPrisma.academicEnrollment.findMany.mockResolvedValue([]);
      mockPrisma.academicTranscript.upsert.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.gradeEnrollment(
        { enrollmentId: 'enr-1', courseId: 'c1', score: 80 },
        3,
      );
      expect(result.score).toBe(80);
      expect(mockPrisma.academicTranscript.upsert).toHaveBeenCalled();
      expect(mockPrisma.academicEnrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });
  });

  describe('getReport', () => {
    it('deve retornar estatísticas académicas', async () => {
      mockPrisma.academicProgram.count.mockResolvedValue(10);
      mockPrisma.academicEnrollment.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(15)
        .mockResolvedValueOnce(5);
      mockPrisma.academicEnrollment.aggregate.mockResolvedValue({ _avg: { finalScore: 72 } });
      mockPrisma.academicProgram.groupBy.mockResolvedValue([]);
      const result = await service.getAcademicReport();
      expect(result.completionRate).toBe(60);
      expect(result.averageScore).toBe(72);
    });
  });

  describe('anos e períodos (leitura/escrita)', () => {
    it('findAllYears deve listar anos', async () => {
      mockPrisma.academicYear.findMany.mockResolvedValue([{ id: 'y1' }]);
      const result = await service.findAllYears();
      expect(result).toHaveLength(1);
    });

    it('getCurrentYear deve retornar ano actual', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'y1' });
      const result = await service.getCurrentYear();
      expect(result?.id).toBe('y1');
    });

    it('createPeriod deve criar período se ano existir', async () => {
      mockPrisma.academicYear.findUnique.mockResolvedValue({ id: 'y1' });
      mockPrisma.academicPeriod.create.mockResolvedValue({
        id: 'p1',
        name: '1S',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createPeriod(
        {
          yearId: 'y1',
          name: '1S',
          startDate: '2025-09-01',
          endDate: '2026-01-31',
        },
        1,
      );
      expect(result.id).toBe('p1');
    });
  });

  describe('programas e turmas (leitura/escrita)', () => {
    it('findAllPrograms deve retornar paginação', async () => {
      mockPrisma.academicProgram.findMany.mockResolvedValue([mockProgram]);
      mockPrisma.academicProgram.count.mockResolvedValue(1);
      const result = await service.findAllPrograms({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('findProgramById deve retornar programa', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(mockProgram);
      const result = await service.findProgramById('prog-1');
      expect(result.id).toBe('prog-1');
    });

    it('findProgramById deve lançar NotFoundException', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(null);
      await expect(service.findProgramById('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('createClass deve criar turma se programa existir', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.academicClass.create.mockResolvedValue({
        id: 'cls-1',
        name: 'Turma A',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      const result = await service.createClass(
        {
          programId: 'prog-1',
          name: 'Turma A',
          startDate: '2026-01-01',
          endDate: '2026-06-30',
        },
        1,
      );
      expect(result.id).toBe('cls-1');
    });

    it('createClass deve lançar NotFoundException se programa não existir', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(null);
      await expect(
        service.createClass(
          {
            programId: 'nao-existe',
            name: 'T',
            startDate: '2026-01-01',
            endDate: '2026-06-30',
          },
          1,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('matrículas/notas/transcrição (leitura)', () => {
    it('getMyEnrollments deve retornar paginação', async () => {
      mockPrisma.academicEnrollment.findMany.mockResolvedValue([mockEnrollment]);
      mockPrisma.academicEnrollment.count.mockResolvedValue(1);
      const result = await service.getMyEnrollments(1, 1, 20);
      expect(result.total).toBe(1);
    });

    it('getEnrollmentGrades deve listar notas', async () => {
      mockPrisma.academicGrade.findMany.mockResolvedValue([{ id: 'g1' }]);
      const result = await service.getEnrollmentGrades('enr-1');
      expect(result).toHaveLength(1);
    });

    it('getTranscript deve retornar transcrição e matrículas', async () => {
      mockPrisma.academicTranscript.findUnique.mockResolvedValue({ userId: 1, gpa: 80 });
      mockPrisma.academicEnrollment.findMany.mockResolvedValue([mockEnrollment]);
      const result = await service.getTranscript(1);
      expect(result.transcript?.gpa).toBe(80);
      expect(result.enrollments).toHaveLength(1);
    });
  });
});
