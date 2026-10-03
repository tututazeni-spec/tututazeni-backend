// Integração com Courses/Enrollments/Assessments (docs/Avatar_Training.md §9, §16):
// nunca duplica registos de origem e só escreve onde está previsto.
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AvatarTrainingIntegrationsService } from './avatar-training-integrations.service';

describe('AvatarTrainingIntegrationsService', () => {
  const prisma: any = {
    course: { findUnique: jest.fn(), count: jest.fn() },
    courseModule: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
    document: { findUnique: jest.fn() },
    libraryItem: { findUnique: jest.fn() },
    enrollment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    assessment: { findUnique: jest.fn() },
    assessmentAttempt: { findFirst: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
  let svc: AvatarTrainingIntegrationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new AvatarTrainingIntegrationsService(prisma);
  });

  describe('resolveEnrollment', () => {
    it('sem curso associado devolve null e não consulta nada', async () => {
      expect(await svc.resolveEnrollment(null, 1)).toBeNull();
      expect(prisma.enrollment.findUnique).not.toHaveBeenCalled();
    });

    it('reutiliza a inscrição existente pela chave courseId_userId (sem duplicar)', async () => {
      prisma.enrollment.findUnique.mockResolvedValue({ id: 42 });
      expect(await svc.resolveEnrollment(5, 1, { autoEnroll: true })).toBe(42);
      expect(prisma.enrollment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { courseId_userId: { courseId: 5, userId: 1 } } }),
      );
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('sem inscrição e sem autoEnroll devolve null', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(null);
      expect(await svc.resolveEnrollment(5, 1)).toBeNull();
      expect(prisma.enrollment.create).not.toHaveBeenCalled();
    });

    it('autoEnroll num curso não publicado → conflito', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(null);
      prisma.course.findUnique.mockResolvedValue({ status: 'DRAFT' });
      await expect(svc.resolveEnrollment(5, 1, { autoEnroll: true })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('autoEnroll cria a inscrição quando o curso está publicado', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(null);
      prisma.course.findUnique.mockResolvedValue({ status: 'PUBLISHED' });
      prisma.enrollment.create.mockResolvedValue({ id: 77 });
      expect(await svc.resolveEnrollment(5, 1, { autoEnroll: true, assignedById: 9 })).toBe(77);
    });

    it('corrida (P2002): devolve a inscrição criada entretanto em vez de rebentar', async () => {
      prisma.enrollment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 55 });
      prisma.course.findUnique.mockResolvedValue({ status: 'PUBLISHED' });
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'x',
      });
      Object.setPrototypeOf(p2002, Prisma.PrismaClientKnownRequestError.prototype);
      prisma.enrollment.create.mockRejectedValue(p2002);
      expect(await svc.resolveEnrollment(5, 1, { autoEnroll: true })).toBe(55);
    });

    it('erros que não são P2002 propagam', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(null);
      prisma.course.findUnique.mockResolvedValue({ status: 'PUBLISHED' });
      prisma.enrollment.create.mockRejectedValue(new Error('db down'));
      await expect(svc.resolveEnrollment(5, 1, { autoEnroll: true })).rejects.toThrow('db down');
    });
  });

  describe('markEnrollmentStarted', () => {
    it('só passa NOT_STARTED → IN_PROGRESS (nunca regride nem conclui)', async () => {
      await svc.markEnrollmentStarted(3);
      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
        where: { id: 3, status: 'NOT_STARTED' },
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      });
    });

    it('sem inscrição não faz nada', async () => {
      await svc.markEnrollmentStarted(null);
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('assertPrerequisites', () => {
    it('sem pré-requisitos passa', async () => {
      await expect(svc.assertPrerequisites(1, [])).resolves.toBeUndefined();
    });

    it('lista os cursos por concluir', async () => {
      prisma.enrollment.findMany.mockResolvedValue([{ courseId: 1 }]);
      await expect(svc.assertPrerequisites(1, [1, 2, 3])).rejects.toThrow(/2, 3/);
    });

    it('passa quando todos estão concluídos', async () => {
      prisma.enrollment.findMany.mockResolvedValue([{ courseId: 1 }, { courseId: 2 }]);
      await expect(svc.assertPrerequisites(1, [1, 2])).resolves.toBeUndefined();
    });
  });

  describe('assertCourse', () => {
    it('curso inexistente → 404', async () => {
      prisma.course.findUnique.mockResolvedValue(null);
      await expect(svc.assertCourse(9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('módulo de outro curso → 400', async () => {
      prisma.course.findUnique.mockResolvedValue({ id: 9 });
      prisma.courseModule.findUnique.mockResolvedValue({ courseId: 8 });
      await expect(svc.assertCourse(9, 1)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('formalAssessmentResult (só leitura)', () => {
    it('sem avaliação formal devolve null', async () => {
      expect(await svc.formalAssessmentResult(null, 1)).toBeNull();
    });

    it('sem tentativas devolve NOT_ATTEMPTED / não aprovado', async () => {
      prisma.assessmentAttempt.findFirst.mockResolvedValue(null);
      expect(await svc.formalAssessmentResult(4, 1)).toMatchObject({
        status: 'NOT_ATTEMPTED',
        passed: false,
      });
    });

    it('devolve a melhor tentativa', async () => {
      prisma.assessmentAttempt.findFirst.mockResolvedValue({ id: 1, passed: true, score: 90 });
      expect(await svc.formalAssessmentResult(4, 1)).toMatchObject({ passed: true });
    });
  });

  describe('resolveSource', () => {
    it('sourceId não numérico para COURSE → 400', async () => {
      await expect(svc.resolveSource('COURSE' as any, 'abc')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('fonte inexistente → 404', async () => {
      prisma.lesson.findUnique.mockResolvedValue(null);
      await expect(svc.resolveSource('LESSON' as any, '5')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('devolve o título da fonte', async () => {
      prisma.libraryItem.findUnique.mockResolvedValue({ title: 'Manual' });
      expect(await svc.resolveSource('LIBRARY_ITEM' as any, 'uuid-1')).toBe('Manual');
    });
  });

  describe('assertCanManageUsers', () => {
    it('ADMIN/RH/DIRECTOR gerem qualquer utilizador', async () => {
      await svc.assertCanManageUsers({ id: 1, role: { name: 'RH' } } as any, [5, 6]);
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('GESTOR só gere subordinados directos', async () => {
      prisma.user.count.mockResolvedValue(1);
      await expect(
        svc.assertCanManageUsers({ id: 2, role: { name: 'GESTOR' } } as any, [5, 6]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('userMatchesAudience', () => {
    it('público-alvo vazio = todos', async () => {
      expect(
        await svc.userMatchesAudience(1, { targetDepartmentIds: [], targetRoleNames: [] }),
      ).toBe(true);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('departamento OU papel', async () => {
      prisma.user.findUnique.mockResolvedValue({ departmentId: 3, role: { name: 'COLABORADOR' } });
      expect(
        await svc.userMatchesAudience(1, { targetDepartmentIds: [3], targetRoleNames: [] }),
      ).toBe(true);
      expect(
        await svc.userMatchesAudience(1, { targetDepartmentIds: [9], targetRoleNames: ['RH'] }),
      ).toBe(false);
    });

    it('utilizador inexistente não pertence a nenhum público', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      expect(
        await svc.userMatchesAudience(1, { targetDepartmentIds: [3], targetRoleNames: [] }),
      ).toBe(false);
    });
  });
});
