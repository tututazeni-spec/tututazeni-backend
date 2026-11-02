// src/common/authz/external-scope.ts
// Âmbito do instrutor externo (fase 3): só vê/gere o que é seu. Tudo é no-op para os restantes
// papéis, por isso os serviços podem chamar estes helpers sem ramificar por papel.
//
// Atenção: LiveClass.instructorId / coInstructorId apontam para TrainingInstructorProfile.id,
// NÃO para User.id. O perfil do externo liga-se ao utilizador por TrainingInstructorProfile.userId.
// Curso: Course.primaryInstructorId e CourseInstructor.userId são User.id.
import { NotFoundException } from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';
import type { PrismaService } from '../../prisma/prisma.service';

export interface ScopeUser {
  id: number;
  fullName?: string | null;
  email?: string | null;
  role?: { name?: string | null } | null;
}

type Db = Pick<PrismaService, 'trainingInstructorProfile' | 'liveClass' | 'course'>;

const NOT_FOUND = 'Recurso não encontrado';

export function isExternalInstructor(user: { role?: { name?: string | null } | null }): boolean {
  return user.role?.name === Role.INSTRUCTOR_EXTERNO;
}

/** Id do perfil de instrutor do externo (null se não for externo ou ainda não tiver perfil). */
export async function ownInstructorProfileId(db: Db, user: ScopeUser): Promise<number | null> {
  if (!isExternalInstructor(user)) return null;
  const profile = await db.trainingInstructorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  return profile?.id ?? null;
}

/** Garante o perfil EXTERNAL do externo (criado na primeira aula) e devolve o seu id. */
export async function ensureOwnInstructorProfile(db: Db, user: ScopeUser): Promise<number> {
  const existing = await ownInstructorProfileId(db, user);
  if (existing !== null) return existing;
  try {
    const created = await db.trainingInstructorProfile.create({
      data: {
        type: 'EXTERNAL',
        userId: user.id,
        name: user.fullName?.trim() || user.email || `Instrutor ${user.id}`,
        email: user.email ?? undefined,
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    // Outro pedido criou o perfil entretanto (userId é único): lê-o.
    if ((e as { code?: string }).code === 'P2002') {
      const again = await ownInstructorProfileId(db, user);
      if (again !== null) return again;
    }
    throw e;
  }
}

/**
 * Junta ao `where` de uma listagem de aulas a condição "sou instrutor ou co-instrutor" e
 * descarta qualquer `instructorId` vindo do cliente. Sem perfil não casa com nada.
 */
export function applyOwnLiveClassScope<T extends Record<string, unknown>>(
  where: T,
  profileId: number | null,
): T & { AND: unknown[] } {
  const { instructorId: _ignored, ...rest } = where as Record<string, unknown>;
  const existing = Array.isArray(rest.AND) ? (rest.AND as unknown[]) : rest.AND ? [rest.AND] : [];
  const own =
    profileId === null
      ? { id: { in: [] as number[] } }
      : { OR: [{ instructorId: profileId }, { coInstructorId: profileId }] };
  return { ...rest, AND: [...existing, own] } as T & { AND: unknown[] };
}

/** 404 se a aula não for do externo. No-op para quem não é externo. */
export async function assertOwnLiveClass(
  db: Db,
  user: ScopeUser,
  liveClassId: number,
): Promise<void> {
  if (!isExternalInstructor(user)) return;
  const profileId = await ownInstructorProfileId(db, user);
  if (profileId === null) throw new NotFoundException(NOT_FOUND);
  const found = await db.liveClass.findFirst({
    where: { id: liveClassId, OR: [{ instructorId: profileId }, { coInstructorId: profileId }] },
    select: { id: true },
  });
  if (!found) throw new NotFoundException(NOT_FOUND);
}

/** 404 se o externo não for instrutor (principal ou co-instrutor) do curso. No-op para os outros. */
export async function assertCanManageCourse(
  db: Db,
  user: ScopeUser,
  courseId: number,
): Promise<void> {
  if (!isExternalInstructor(user)) return;
  const found = await db.course.findFirst({
    where: {
      id: courseId,
      OR: [{ primaryInstructorId: user.id }, { instructors: { some: { userId: user.id } } }],
    },
    select: { id: true },
  });
  if (!found) throw new NotFoundException(NOT_FOUND);
}
