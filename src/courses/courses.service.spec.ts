import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';
import { CourseStatus } from './courses.dto';

const mockPrisma = {
  course: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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
  courseAnalytics: { create: jest.fn().mockResolvedValue({}) },
  enrollment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  certificate: { create: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const baseCourse = {
  id: 1,
  title: 'Curso Teste',
  status: 'PUBLISHED',
  internalCode: 'C001',
  mandatory: false,
  _count: { enrollments: 0, feedbacks: 0, modules: 2 },
  competencies: [],
  modules: [],
  feedbacks: [],
  department: null,
};

describe('CoursesService', () => {
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
      providers: [CoursesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CoursesService>(CoursesService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de cursos', async () => {
      mockPrisma.course.findMany.mockResolvedValue([baseCourse]);
      mockPrisma.course.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('deve filtrar por search, category e status', async () => {
      mockPrisma.course.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(0);

      await service.findAll({ search: 'NestJS', category: 'Tech', status: CourseStatus.PUBLISHED });

      expect(mockPrisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED', category: 'Tech' }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar curso por id', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);

      const result = await service.findOne(1);

      expect(result.title).toBe('Curso Teste');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar curso e courseAnalytics', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(null);
      mockPrisma.course.create.mockResolvedValue(baseCourse);

      const result = await service.create({ title: 'Novo Curso', internalCode: 'NEW01' });

      expect(result.title).toBe('Curso Teste');
      expect(mockPrisma.courseAnalytics.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se internalCode duplicado', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(baseCourse);
      await expect(service.create({ title: 'X', internalCode: 'C001' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve criar curso sem internalCode', async () => {
      mockPrisma.course.create.mockResolvedValue({ ...baseCourse, internalCode: null });

      const result = await service.create({ title: 'Sem Código' });

      expect(result).toBeDefined();
      expect(mockPrisma.course.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar curso com sucesso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.course.update.mockResolvedValue({ ...baseCourse, title: 'Actualizado' });

      const result = await service.update(1, { title: 'Actualizado' });

      expect(result.title).toBe('Actualizado');
    });

    it('deve lançar NotFoundException se curso não existe', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { title: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar curso com módulos', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.course.update.mockResolvedValue({ ...baseCourse, status: 'PUBLISHED' });

      const result = await service.publish(1);

      expect(result.status).toBe('PUBLISHED');
    });

    it('deve lançar BadRequestException se sem módulos', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        ...baseCourse,
        _count: { enrollments: 0, feedbacks: 0, modules: 0 },
      });
      await expect(service.publish(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── archive ──────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('deve arquivar curso com sucesso', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(baseCourse);
      mockPrisma.course.update.mockResolvedValue({ ...baseCourse, status: 'ARCHIVED' });

      const result = await service.archive(1);

      expect(result.status).toBe('ARCHIVED');
    });
  });

  // ─── getCategories ────────────────────────────────────────────────────────

  describe('getCategories', () => {
    it('deve retornar categorias agrupadas', async () => {
      mockPrisma.course.groupBy.mockResolvedValue([
        { category: 'Tech', _count: { id: 5 } },
        { category: null, _count: { id: 2 } },
      ]);

      const result = await service.getCategories();

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Tech');
    });
  });
});
