// Testes para Turmas/Categorias/Relatórios (docs/modulo_courses.md secções
// 5-7). Segue o mesmo padrão de mock de courses.service.additional.spec.ts
// (mockPrisma.read auto-referenciado). getCourseReports() é testado com
// spyOn(service, 'getAdminDashboard') em vez de mockar as ~2 dezenas de
// queries do dashboard — esse método já tem cobertura própria em
// courses.service.progress.spec.ts.

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseCompletionService } from '../course-completion/course-completion.service';
import type { CurrentUserData } from '../common/types/current-user';

const mockPrisma = {
  course: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  courseCohort: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  courseCohortParticipant: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  courseCategory: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  attendanceRecord: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  evaluationAttempt: {
    findMany: jest.fn(),
  },
  enrollment: {
    aggregate: jest.fn(),
    count: jest.fn(),
  },
  learningPathCourse: { findMany: jest.fn().mockResolvedValue([]) },
};

const mockCourseCompletion = {
  markLessonComplete: jest.fn(),
  getCourseProgressNumbers: jest.fn(),
};

const admin: CurrentUserData = { id: 1, role: { id: 1, name: 'ADMIN' } } as any;
const rh: CurrentUserData = { id: 2, role: { id: 2, name: 'RH' } } as any;
const instructorOwner: CurrentUserData = { id: 10, role: { id: 3, name: 'INSTRUCTOR' } } as any;
const instructorOther: CurrentUserData = { id: 11, role: { id: 3, name: 'INSTRUCTOR' } } as any;

describe('CoursesService — Turmas/Categorias/Relatórios', () => {
  let service: CoursesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CourseCompletionService, useValue: mockCourseCompletion },
      ],
    }).compile();
    service = module.get<CoursesService>(CoursesService);
  });

  // ─── Turmas ────────────────────────────────────────────────────────────

  describe('listCohorts', () => {
    it('calcula inscritos e vagas disponíveis', async () => {
      mockPrisma.courseCohort.findMany.mockResolvedValue([
        { id: 1, capacity: 30, _count: { participants: 12 }, instructor: null },
      ]);
      const result = await service.listCohorts(5);
      expect(result[0].enrolled).toBe(12);
      expect(result[0].availableSlots).toBe(18);
    });
  });

  describe('getCohort', () => {
    it('lança NotFoundException se a turma não existir', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue(null);
      await expect(service.getCohort(1, admin)).rejects.toThrow(NotFoundException);
    });

    it('lança ForbiddenException para instrutor que não é o dono da turma', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue({
        id: 1,
        instructorId: instructorOwner.id,
        capacity: 30,
        participants: [],
      });
      await expect(service.getCohort(1, instructorOther)).rejects.toThrow(ForbiddenException);
    });

    it('permite ao instrutor dono ver a sua turma', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue({
        id: 1,
        instructorId: instructorOwner.id,
        capacity: 30,
        participants: [{ userId: 99 }],
      });
      const result = await service.getCohort(1, instructorOwner);
      expect(result.enrolled).toBe(1);
      expect(result.availableSlots).toBe(29);
    });

    it('permite a ADMIN/RH ver qualquer turma', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue({
        id: 1,
        instructorId: instructorOwner.id,
        capacity: 30,
        participants: [],
      });
      await expect(service.getCohort(1, rh)).resolves.toBeDefined();
    });
  });

  describe('createCohort', () => {
    it('confirma que o curso existe antes de criar', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 5,
        category: null,
        competencies: [],
      });
      mockPrisma.courseCohort.create.mockResolvedValue({ id: 1 });
      await service.createCohort(5, {
        name: 'Turma A',
        startDate: '2026-10-01',
      } as any);
      expect(mockPrisma.courseCohort.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ courseId: 5, name: 'Turma A' }) }),
      );
    });
  });

  describe('updateCohort / closeCohort', () => {
    it('lança ForbiddenException se o instrutor não é o dono', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue({ id: 1, instructorId: instructorOwner.id });
      await expect(
        service.updateCohort(1, { name: 'Nova' } as any, instructorOther),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.closeCohort(1, instructorOther)).rejects.toThrow(ForbiddenException);
    });

    it('encerra a turma (status CLOSED)', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue({ id: 1, instructorId: null });
      mockPrisma.courseCohort.update.mockResolvedValue({ id: 1, status: 'CLOSED' });
      await service.closeCohort(1, admin);
      expect(mockPrisma.courseCohort.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'CLOSED' },
      });
    });
  });

  describe('addCohortParticipants', () => {
    it('rejeita quando excede a capacidade disponível', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue({
        id: 1,
        instructorId: null,
        capacity: 5,
        _count: { participants: 4 },
      });
      mockPrisma.courseCohortParticipant.findMany.mockResolvedValue([]);
      await expect(
        service.addCohortParticipants(1, { userIds: [1, 2, 3] } as any, admin),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.courseCohortParticipant.createMany).not.toHaveBeenCalled();
    });

    it('ignora utilizadores já inscritos e adiciona só os novos', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue({
        id: 1,
        instructorId: null,
        capacity: 30,
        _count: { participants: 0 },
      });
      mockPrisma.courseCohortParticipant.findMany.mockResolvedValue([{ userId: 1 }]);
      const result = await service.addCohortParticipants(1, { userIds: [1, 2] } as any, admin);
      expect(result).toEqual({ added: 1 });
      expect(mockPrisma.courseCohortParticipant.createMany).toHaveBeenCalledWith({
        data: [{ cohortId: 1, userId: 2 }],
      });
    });
  });

  describe('markCohortAttendance', () => {
    it('faz upsert por participante com context LMS e sessionId = cohortId', async () => {
      mockPrisma.courseCohort.findUnique.mockResolvedValue({ id: 7, courseId: 3, instructorId: null });
      mockPrisma.attendanceRecord.upsert.mockResolvedValue({});
      await service.markCohortAttendance(
        7,
        { date: '2026-09-19', records: [{ userId: 1, present: true }, { userId: 2, present: false }] } as any,
        admin,
      );
      expect(mockPrisma.attendanceRecord.upsert).toHaveBeenCalledTimes(2);
      const firstCall = mockPrisma.attendanceRecord.upsert.mock.calls[0][0];
      expect(firstCall.create).toMatchObject({
        userId: 1,
        context: 'LMS',
        status: 'PRESENT',
        courseId: 3,
        sessionId: 7,
      });
      const secondCall = mockPrisma.attendanceRecord.upsert.mock.calls[1][0];
      expect(secondCall.create.status).toBe('ABSENT');
    });
  });

  // ─── Categorias ────────────────────────────────────────────────────────

  describe('listCategoriesManaged', () => {
    it('junta categorias geridas com contagem de cursos por nome', async () => {
      mockPrisma.courseCategory.findMany.mockResolvedValue([
        { id: 1, name: 'Liderança', isActive: true },
      ]);
      mockPrisma.course.count.mockResolvedValue(0);
      mockPrisma.course.groupBy.mockResolvedValue([{ category: 'Liderança', _count: 4 }]);
      const result = await service.listCategoriesManaged();
      expect(result[0].courseCount).toBe(4);
    });
  });

  describe('createCategory', () => {
    it('lança ConflictException se o nome já existir', async () => {
      mockPrisma.courseCategory.findUnique.mockResolvedValue({ id: 1 });
      await expect(service.createCategory({ name: 'Liderança' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateCategory', () => {
    it('lança NotFoundException se a categoria não existir', async () => {
      mockPrisma.courseCategory.findUnique.mockResolvedValue(null);
      await expect(service.updateCategory(99, { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeCategory', () => {
    it('rejeita remover categoria com cursos associados', async () => {
      mockPrisma.courseCategory.findUnique.mockResolvedValue({ id: 1, name: 'Liderança' });
      mockPrisma.course.count.mockResolvedValue(3);
      await expect(service.removeCategory(1)).rejects.toThrow(ConflictException);
      expect(mockPrisma.courseCategory.delete).not.toHaveBeenCalled();
    });

    it('remove categoria sem cursos associados', async () => {
      mockPrisma.courseCategory.findUnique.mockResolvedValue({ id: 1, name: 'Vazia' });
      mockPrisma.course.count.mockResolvedValue(0);
      mockPrisma.courseCategory.delete.mockResolvedValue({ id: 1 });
      await service.removeCategory(1);
      expect(mockPrisma.courseCategory.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  // ─── Relatórios ────────────────────────────────────────────────────────

  describe('getCourseReports', () => {
    it('combina o dashboard com avaliações, abandono e progresso médio', async () => {
      jest.spyOn(service, 'getAdminDashboard').mockResolvedValue({
        counts: { totalEnrollments: 100 },
        topCourses: [],
        bestCompletion: [],
        worstCompletion: [],
        byDepartment: [],
        byUnit: [],
        rates: { avgCompletionRate: 70, totalLearningHours: 500 },
      } as any);
      mockPrisma.evaluationAttempt.findMany.mockResolvedValue([
        { scorePercent: 80, passed: true },
        { scorePercent: 40, passed: false },
      ]);
      mockPrisma.enrollment.aggregate.mockResolvedValue({ _avg: { progress: 55.4 } });
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 1, title: 'Compliance', _count: { enrollments: 3 } },
      ]);
      mockPrisma.enrollment.count.mockResolvedValue(20);

      const result = await service.getCourseReports();

      expect(result.abandonmentRate).toBe(20); // 20/100
      expect(result.avgProgress).toBe(55);
      expect(result.evaluationResults).toEqual({
        totalAttempts: 2,
        avgScore: 60,
        passRate: 50,
      });
      expect(result.mandatoryPending).toEqual({
        count: 3,
        courses: [{ id: 1, title: 'Compliance', pending: 3 }],
      });
      expect(result.approvalRate).toBe(70);
      expect(result.totalLearningHours).toBe(500);
    });
  });
});
