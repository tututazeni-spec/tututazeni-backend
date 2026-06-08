import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  course: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  courseModule: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  lesson: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  lessonProgress: {
    upsert: jest.fn(),
    count: jest.fn(),
  },
  courseAnalytics: {
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  },
  courseCompetency: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  enrollment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  certificate: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
  user: {
    findMany: jest.fn(),
  },
};

const baseCourse = {
  id: 1,
  title: 'Curso Teste',
  status: 'PUBLISHED',
  internalCode: 'C001',
  mandatory: false,
  modules: [{ id: 1, lessons: [] }],
  feedbacks: [],
  department: null,
  competencies: [],
  _count: { enrollments: 0, feedbacks: 0, modules: 1 },
};

describe('CoursesService (additional)', () => {
  let service: CoursesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CoursesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CoursesService>(CoursesService);
  });

  // ─── findAll ─────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista de cursos paginada', async () => {
      mockPrisma.course.findMany.mockResolvedValue([baseCourse]);
      mockPrisma.course.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve filtrar por status', async () => {
      mockPrisma.course.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(0);
      await service.findAll({ status: 'PUBLISHED' as any });
      expect(mockPrisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLISHED' }) }),
      );
    });

    it('deve filtrar por search', async () => {
      mockPrisma.course.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(0);
      await service.findAll({ search: 'liderança' });
      expect(mockPrisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });

    it('deve filtrar por category, level, mandatory, departmentId', async () => {
      mockPrisma.course.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(0);
      await service.findAll({
        category: 'TECH',
        level: 'BEGINNER' as any,
        mandatory: true,
        departmentId: 2,
      });
      expect(mockPrisma.course.findMany).toHaveBeenCalled();
    });
  });

  // ─── findOne ─────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar curso por id', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getCategories ────────────────────────────────────────────

  describe('getCategories', () => {
    it('deve retornar categorias com contagem', async () => {
      mockPrisma.course.groupBy.mockResolvedValue([
        { category: 'TECH', _count: { id: 5 } },
        { category: null, _count: { id: 2 } },
      ]);
      const result = await service.getCategories();
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('TECH');
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar curso com sucesso', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(null);
      mockPrisma.course.create.mockResolvedValue(baseCourse);
      mockPrisma.courseAnalytics.create.mockResolvedValue({});
      const result = await service.create({ title: 'Novo Curso', internalCode: 'C002' } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.courseAnalytics.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se internalCode já existe', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(baseCourse);
      await expect(
        service.create({ title: 'Duplicado', internalCode: 'C001' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('deve criar curso sem internalCode (sem verificação de duplicado)', async () => {
      mockPrisma.course.create.mockResolvedValue({ ...baseCourse, internalCode: null });
      mockPrisma.courseAnalytics.create.mockResolvedValue({});
      const result = await service.create({ title: 'Sem Código' } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.course.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar curso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.course.update.mockResolvedValue({ ...baseCourse, title: 'Atualizado' });
      const result = await service.update(1, { title: 'Atualizado' } as any);
      expect(result.title).toBe('Atualizado');
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { title: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publish ──────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar curso com módulos', async () => {
      const courseWithModules = { ...baseCourse, _count: { ...baseCourse._count, modules: 2 } };
      mockPrisma.course.findUnique.mockResolvedValue(courseWithModules);
      mockPrisma.course.update.mockResolvedValue({ ...courseWithModules, status: 'PUBLISHED' });
      const result = await service.publish(1);
      expect(result.status).toBe('PUBLISHED');
    });

    it('deve lançar BadRequestException se sem módulos', async () => {
      const courseNoModules = { ...baseCourse, _count: { ...baseCourse._count, modules: 0 } };
      mockPrisma.course.findUnique.mockResolvedValue(courseNoModules);
      await expect(service.publish(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── archive ──────────────────────────────────────────────────

  describe('archive', () => {
    it('deve arquivar curso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.course.update.mockResolvedValue({ ...baseCourse, status: 'ARCHIVED' });
      const result = await service.archive(1);
      expect(result.status).toBe('ARCHIVED');
    });
  });

  // ─── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('deve eliminar curso em DRAFT', async () => {
      const draftCourse = {
        ...baseCourse,
        status: 'DRAFT',
        _count: { ...baseCourse._count, enrollments: 0 },
      };
      mockPrisma.course.findUnique.mockResolvedValue(draftCourse);
      mockPrisma.course.delete.mockResolvedValue(draftCourse);
      const result = await service.remove(1);
      expect(result.message).toBe('Curso eliminado');
    });

    it('deve lançar ForbiddenException para PUBLISHED com matrículas', async () => {
      const publishedWithEnrollments = {
        ...baseCourse,
        status: 'PUBLISHED',
        _count: { ...baseCourse._count, enrollments: 5 },
      };
      mockPrisma.course.findUnique.mockResolvedValue(publishedWithEnrollments);
      await expect(service.remove(1)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── addCompetency / removeCompetency ─────────────────────────

  describe('addCompetency', () => {
    it('deve adicionar competência ao curso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.courseCompetency.upsert.mockResolvedValue({ courseId: 1, competencyId: 2 });
      const result = await service.addCompetency(1, 2);
      expect(result).toBeDefined();
    });
  });

  describe('removeCompetency', () => {
    it('deve remover competência do curso', async () => {
      mockPrisma.courseCompetency.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.removeCompetency(1, 2);
      expect(result).toBeDefined();
    });
  });

  // ─── createModule ─────────────────────────────────────────────

  describe('createModule', () => {
    it('deve criar módulo no curso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.courseModule.create.mockResolvedValue({ id: 1, courseId: 1, title: 'Módulo 1' });
      const result = await service.createModule(1, { title: 'Módulo 1', seq: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.createModule(99, { title: 'X' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateModule ─────────────────────────────────────────────

  describe('updateModule', () => {
    it('deve actualizar módulo', async () => {
      mockPrisma.courseModule.findFirst.mockResolvedValue({ id: 1, courseId: 1 });
      mockPrisma.courseModule.update.mockResolvedValue({ id: 1, title: 'Actualizado' });
      const result = await service.updateModule(1, 1, { title: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se módulo não pertence ao curso', async () => {
      mockPrisma.courseModule.findFirst.mockResolvedValue(null);
      await expect(service.updateModule(1, 99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── reorderModules ───────────────────────────────────────────

  describe('reorderModules', () => {
    it('deve reordenar módulos', async () => {
      mockPrisma.courseModule.update.mockResolvedValue({});
      const result = await service.reorderModules(1, [3, 1, 2]);
      expect(result.message).toBe('Módulos reordenados');
    });
  });

  // ─── removeModule ─────────────────────────────────────────────

  describe('removeModule', () => {
    it('deve remover módulo', async () => {
      mockPrisma.courseModule.findFirst.mockResolvedValue({ id: 1, courseId: 1 });
      mockPrisma.courseModule.delete.mockResolvedValue({});
      await service.removeModule(1, 1);
      expect(mockPrisma.courseModule.delete).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se módulo não encontrado', async () => {
      mockPrisma.courseModule.findFirst.mockResolvedValue(null);
      await expect(service.removeModule(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createLesson ─────────────────────────────────────────────

  describe('createLesson', () => {
    it('deve criar aula num módulo', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.lesson.create.mockResolvedValue({ id: 1, title: 'Aula 1' });
      const result = await service.createLesson(1, { title: 'Aula 1', seq: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se módulo não existe', async () => {
      mockPrisma.courseModule.findUnique.mockResolvedValue(null);
      await expect(service.createLesson(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateLesson ─────────────────────────────────────────────

  describe('updateLesson', () => {
    it('deve actualizar aula', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.lesson.update.mockResolvedValue({ id: 1, title: 'Actualizada' });
      const result = await service.updateLesson(1, { title: 'Actualizada' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se aula não existe', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.updateLesson(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── reorderLessons ───────────────────────────────────────────

  describe('reorderLessons', () => {
    it('deve reordenar aulas', async () => {
      mockPrisma.lesson.update.mockResolvedValue({});
      const result = await service.reorderLessons(1, [2, 1, 3]);
      expect(result.message).toBe('Aulas reordenadas');
    });
  });

  // ─── removeLesson ─────────────────────────────────────────────

  describe('removeLesson', () => {
    it('deve remover aula', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.lesson.delete.mockResolvedValue({});
      await service.removeLesson(1);
      expect(mockPrisma.lesson.delete).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se aula não existe', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.removeLesson(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── enroll ───────────────────────────────────────────────────

  describe('enroll', () => {
    it('deve matricular utilizador em curso publicado', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockResolvedValue({ id: 1, courseId: 1, userId: 2 });
      mockPrisma.courseAnalytics.updateMany.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});
      const result = await service.enroll(1, 2, {});
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException para curso não publicado', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ ...baseCourse, status: 'DRAFT' });
      await expect(service.enroll(1, 2, {})).rejects.toThrow(BadRequestException);
    });

    it('deve lançar ConflictException se já matriculado', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1, status: 'ACTIVE' });
      await expect(service.enroll(1, 2, {})).rejects.toThrow(ConflictException);
    });

    it('deve permitir re-matrícula se status EXPIRED', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1, status: 'EXPIRED' });
      mockPrisma.enrollment.create.mockResolvedValue({ id: 2, courseId: 1, userId: 2 });
      mockPrisma.courseAnalytics.updateMany.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});
      const result = await service.enroll(1, 2, {});
      expect(result).toBeDefined();
    });
  });

  // ─── getMyEnrollments ─────────────────────────────────────────

  describe('getMyEnrollments', () => {
    it('deve retornar matrículas do utilizador', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { id: 1, courseId: 1, userId: 1, course: baseCourse },
      ]);
      const result = await service.getMyEnrollments(1);
      expect(result).toHaveLength(1);
    });
  });

  // ─── assignCourse ─────────────────────────────────────────────

  describe('assignCourse', () => {
    it('deve atribuir curso a utilizador individual', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});
      mockPrisma.courseAnalytics.updateMany.mockResolvedValue({});
      const result = await service.assignCourse(
        1,
        { targetType: 'USER' as any, targetId: 2, mandatory: true },
        1,
      );
      expect(result.enrolled).toBe(1);
    });

    it('deve atribuir curso a departamento', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});
      mockPrisma.courseAnalytics.updateMany.mockResolvedValue({});
      const result = await service.assignCourse(
        1,
        { targetType: 'DEPARTMENT' as any, targetId: 1 },
        1,
      );
      expect(result.total).toBe(2);
    });

    it('deve ignorar utilizadores já matriculados no assign', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 1, status: 'ACTIVE' });
      const result = await service.assignCourse(1, { targetType: 'USER' as any, targetId: 2 }, 1);
      expect(result.skipped).toBe(1);
    });

    it('deve lançar BadRequestException para curso não publicado no assign', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({ ...baseCourse, status: 'DRAFT' });
      await expect(
        service.assignCourse(1, { targetType: 'USER' as any, targetId: 2 }, 1),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
