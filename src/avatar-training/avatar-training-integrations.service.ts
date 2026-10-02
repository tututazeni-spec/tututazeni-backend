// src/avatar-training/avatar-training-integrations.service.ts
// Ponte com os módulos oficiais da Academia (Courses, Enrollments, Assessments,
// conteúdos). O Avatar Training nunca duplica estes registos: apenas lê, valida
// e, nos pontos indicados, actualiza o registo de origem.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { AvatarTrainingSourceType } from './dto/avatar-training.dto';

@Injectable()
export class AvatarTrainingIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Courses ────────────────────────────────────────────────────────────────

  async assertCourse(courseId: number, moduleId?: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true },
    });
    if (!course) throw new NotFoundException('Curso associado não encontrado');
    if (moduleId !== undefined) {
      const mod = await this.prisma.courseModule.findUnique({
        where: { id: moduleId },
        select: { courseId: true },
      });
      if (!mod || mod.courseId !== courseId) {
        throw new BadRequestException('O módulo não pertence ao curso indicado');
      }
    }
    return course;
  }

  async assertCourses(courseIds: number[]) {
    if (!courseIds.length) return;
    const found = await this.prisma.course.count({ where: { id: { in: courseIds } } });
    if (found !== new Set(courseIds).size) {
      throw new BadRequestException('Algum dos cursos de pré-requisito não existe');
    }
  }

  async assertUserExists(userId: number, label: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException(`${label} não encontrado`);
  }

  // ── Enrollments ────────────────────────────────────────────────────────────

  /** Devolve a inscrição existente (chave courseId_userId) ou, se pedido, cria-a sem duplicar. */
  async resolveEnrollment(
    courseId: number | null,
    userId: number,
    opts: {
      autoEnroll?: boolean;
      assignedById?: number;
      mandatory?: boolean;
      deadline?: Date | null;
    } = {},
  ): Promise<number | null> {
    if (!courseId) return null;
    const key = { courseId_userId: { courseId, userId } };
    const existing = await this.prisma.enrollment.findUnique({ where: key, select: { id: true } });
    if (existing) return existing.id;
    if (!opts.autoEnroll) return null;

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { status: true },
    });
    if (course?.status !== 'PUBLISHED') {
      throw new ConflictException('Só é possível inscrever em cursos publicados');
    }
    try {
      const created = await this.prisma.enrollment.create({
        data: {
          courseId,
          userId,
          origin: 'MANUAL',
          assignedById: opts.assignedById,
          mandatory: opts.mandatory ?? false,
          deadline: opts.deadline ?? undefined,
        },
        select: { id: true },
      });
      return created.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.enrollment.findUnique({ where: key, select: { id: true } });
        return again?.id ?? null;
      }
      throw e;
    }
  }

  /** Primeira actividade no avatar → inscrição passa a "em curso" (única escrita nas Enrollments). */
  async markEnrollmentStarted(enrollmentId: number | null) {
    if (!enrollmentId) return;
    await this.prisma.enrollment.updateMany({
      where: { id: enrollmentId, status: 'NOT_STARTED' },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
  }

  /** Estado oficial do curso — só leitura; a conclusão do curso pertence a Enrollments. */
  async courseStatus(enrollmentId: number | null) {
    if (!enrollmentId) return null;
    return this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, courseId: true, status: true, progress: true, deadline: true },
    });
  }

  async assertPrerequisites(userId: number, courseIds: number[]) {
    if (!courseIds.length) return;
    const done = await this.prisma.enrollment.findMany({
      where: { userId, courseId: { in: courseIds }, status: 'COMPLETED' },
      select: { courseId: true },
    });
    const doneIds = new Set(done.map(d => d.courseId));
    const missing = courseIds.filter(id => !doneIds.has(id));
    if (missing.length) {
      throw new ConflictException(`Pré-requisitos por concluir (cursos: ${missing.join(', ')})`);
    }
  }

  // ── Assessments ────────────────────────────────────────────────────────────

  async assertAssessment(assessmentId: number, courseId: number | null) {
    const a = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, courseId: true, title: true },
    });
    if (!a) throw new NotFoundException('Avaliação formal não encontrada');
    if (courseId && a.courseId && a.courseId !== courseId) {
      throw new BadRequestException('A avaliação pertence a outro curso');
    }
    return a;
  }

  /** Resultado formal do utilizador (leitura) — o Avatar Training não escreve notas formais. */
  async formalAssessmentResult(assessmentId: number | null, userId: number) {
    if (!assessmentId) return null;
    const best = await this.prisma.assessmentAttempt.findFirst({
      where: { assessmentId, userId, status: { in: ['PASSED', 'FAILED', 'SUBMITTED'] } },
      orderBy: [{ passed: 'desc' }, { score: 'desc' }],
      select: { id: true, status: true, passed: true, score: true },
    });
    return best ?? { id: null, status: 'NOT_ATTEMPTED', passed: false, score: null };
  }

  // ── Conteúdos / fontes aprovadas ───────────────────────────────────────────

  /** Valida a existência da fonte no módulo de origem e devolve um título. */
  async resolveSource(type: AvatarTrainingSourceType, sourceId: string): Promise<string> {
    const asInt = (): number => {
      const n = Number(sourceId);
      if (!Number.isInteger(n)) throw new BadRequestException('sourceId inválido para este tipo');
      return n;
    };
    let title: string | undefined;
    switch (type) {
      case 'COURSE':
        title = (
          await this.prisma.course.findUnique({ where: { id: asInt() }, select: { title: true } })
        )?.title;
        break;
      case 'LESSON':
        title = (
          await this.prisma.lesson.findUnique({ where: { id: asInt() }, select: { title: true } })
        )?.title;
        break;
      case 'DOCUMENT':
        title = (
          await this.prisma.document.findUnique({ where: { id: asInt() }, select: { title: true } })
        )?.title;
        break;
      case 'LIBRARY_ITEM':
        title = (
          await this.prisma.libraryItem.findUnique({
            where: { id: sourceId },
            select: { title: true },
          })
        )?.title;
        break;
    }
    if (!title) throw new NotFoundException('Fonte não encontrada no módulo de origem');
    return title;
  }

  // ── Utilizadores / segmentação ─────────────────────────────────────────────

  /** ADMIN/RH/DIRECTOR: qualquer utilizador; GESTOR/LIDER: subordinados directos. */
  async assertCanManageUsers(actor: CurrentUserData, userIds: number[]) {
    if (isPrivileged(actor, [Role.ADMIN, Role.RH, Role.DIRECTOR])) return;
    const reports = await this.prisma.user.count({
      where: { id: { in: userIds }, managerId: actor.id },
    });
    if (reports !== new Set(userIds).size) {
      throw new NotFoundException('Utilizador não encontrado');
    }
  }

  async directReportIds(managerId: number): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: { managerId },
      select: { id: true },
    });
    return rows.map(r => r.id);
  }

  /** Público-alvo da formação: vazio = todos; caso contrário departamento OU papel. */
  async userMatchesAudience(
    userId: number,
    program: { targetDepartmentIds: number[]; targetRoleNames: string[] },
  ): Promise<boolean> {
    if (!program.targetDepartmentIds.length && !program.targetRoleNames.length) return true;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true, role: { select: { name: true } } },
    });
    if (!u) return false;
    return (
      (u.departmentId !== null && program.targetDepartmentIds.includes(u.departmentId)) ||
      (!!u.role && program.targetRoleNames.includes(u.role.name))
    );
  }
}
