import {
  getEnrollments,
  getEnrollmentById,
  createEnrollment,
  updateEnrollment,
  deleteEnrollment,
} from './enrollmentService';

const mockEnrollment = {
  id: 1,
  userId: 10,
  courseId: 5,
  status: 'EM_ANDAMENTO',
  enrolledAt: new Date('2024-01-01'),
};

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    enrollment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const prismaMock = require('../lib/prisma').default;

describe('enrollmentService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getEnrollments', () => {
    it('deve retornar lista de enrollments mapeada', async () => {
      prismaMock.enrollment.findMany.mockResolvedValue([mockEnrollment]);

      const result = await getEnrollments();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 1, userId: 10, courseId: 5, status: 'EM_ANDAMENTO' });
    });

    it('deve retornar lista vazia se não houver enrollments', async () => {
      prismaMock.enrollment.findMany.mockResolvedValue([]);

      const result = await getEnrollments();
      expect(result).toHaveLength(0);
    });
  });

  describe('getEnrollmentById', () => {
    it('deve retornar enrollment por id', async () => {
      prismaMock.enrollment.findUnique.mockResolvedValue(mockEnrollment);

      const result = await getEnrollmentById(1);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(1);
    });

    it('deve retornar null se não encontrado', async () => {
      prismaMock.enrollment.findUnique.mockResolvedValue(null);

      const result = await getEnrollmentById(99);
      expect(result).toBeNull();
    });
  });

  describe('createEnrollment', () => {
    it('deve criar enrollment com status padrão', async () => {
      prismaMock.enrollment.create.mockResolvedValue(mockEnrollment);

      const result = await createEnrollment(10, 5);

      expect(result.userId).toBe(10);
      expect(result.courseId).toBe(5);
    });

    it('deve criar enrollment com status personalizado', async () => {
      const customEnrollment = { ...mockEnrollment, status: 'CONCLUIDO' };
      prismaMock.enrollment.create.mockResolvedValue(customEnrollment);

      const result = await createEnrollment(10, 5, 'CONCLUIDO');
      expect(result.status).toBe('CONCLUIDO');
    });
  });

  describe('updateEnrollment', () => {
    it('deve actualizar enrollment', async () => {
      const updated = { ...mockEnrollment, status: 'CONCLUIDO' };
      prismaMock.enrollment.update.mockResolvedValue(updated);

      const result = await updateEnrollment(1, { status: 'CONCLUIDO' });

      expect(result.status).toBe('CONCLUIDO');
    });
  });

  describe('deleteEnrollment', () => {
    it('deve eliminar enrollment sem retornar valor', async () => {
      prismaMock.enrollment.delete.mockResolvedValue(mockEnrollment);

      await expect(deleteEnrollment(1)).resolves.not.toThrow();
      expect(prismaMock.enrollment.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });
});
