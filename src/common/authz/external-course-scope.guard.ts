// src/common/authz/external-course-scope.guard.ts
// Posse de conteúdo para o instrutor externo (fase 3): resolve o curso a que o recurso do pedido
// (curso, módulo, lição, material, atividade, recurso) pertence e exige que o externo seja o
// instrutor desse curso. Para qualquer outro papel é um no-op, por isso pode ficar ligado a
// handlers partilhados com ADMIN/RH/alunos. Corre DEPOIS do RolesGuard (guards globais primeiro).
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCanManageCourse, isExternalInstructor } from './external-scope';

export const EXTERNAL_COURSE_SCOPE_KEY = 'externalCourseScope';

export type CourseScopeKind =
  'course' | 'module' | 'lesson' | 'moduleMaterial' | 'lessonActivity' | 'lessonResource';

export interface CourseScopeSpec {
  kind: CourseScopeKind;
  /** Nome do parâmetro de rota (ou do campo do corpo, com `from: 'body'`) que traz o id. */
  key: string;
  from?: 'params' | 'body';
}

/** Todos os âmbitos indicados têm de passar (ex.: mover uma lição valida a lição E o módulo destino). */
export const ExternalCourseScope = (...specs: CourseScopeSpec[]) =>
  SetMetadata(EXTERNAL_COURSE_SCOPE_KEY, specs);

const NOT_FOUND = 'Recurso não encontrado';

@Injectable()
export class ExternalCourseScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const specs = this.reflector.getAllAndOverride<CourseScopeSpec[] | undefined>(
      EXTERNAL_COURSE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!specs?.length || !user || !isExternalInstructor(user)) return true;

    for (const spec of specs) {
      const source = (spec.from === 'body' ? req.body : req.params) as Record<string, unknown>;
      const id = Number(source?.[spec.key]);
      if (!Number.isInteger(id) || id <= 0) throw new NotFoundException(NOT_FOUND);
      const courseId = spec.kind === 'course' ? id : await this.courseIdOf(spec.kind, id);
      if (courseId === null) throw new NotFoundException(NOT_FOUND);
      await assertCanManageCourse(this.prisma, user, courseId);
    }
    return true;
  }

  private async courseIdOf(
    kind: Exclude<CourseScopeKind, 'course'>,
    id: number,
  ): Promise<number | null> {
    switch (kind) {
      case 'module':
        return (
          (await this.prisma.courseModule.findUnique({ where: { id }, select: { courseId: true } }))
            ?.courseId ?? null
        );
      case 'lesson':
        return (
          (
            await this.prisma.lesson.findUnique({
              where: { id },
              select: { module: { select: { courseId: true } } },
            })
          )?.module.courseId ?? null
        );
      case 'moduleMaterial':
        return (
          (
            await this.prisma.moduleMaterial.findUnique({
              where: { id },
              select: { module: { select: { courseId: true } } },
            })
          )?.module.courseId ?? null
        );
      case 'lessonActivity':
        return (
          (
            await this.prisma.lessonActivity.findUnique({
              where: { id },
              select: { lesson: { select: { module: { select: { courseId: true } } } } },
            })
          )?.lesson.module.courseId ?? null
        );
      case 'lessonResource':
        return (
          (
            await this.prisma.lessonResource.findUnique({
              where: { id },
              select: { lesson: { select: { module: { select: { courseId: true } } } } },
            })
          )?.lesson.module.courseId ?? null
        );
    }
  }
}
