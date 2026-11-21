// src/evaluation/evaluation-admin-rule.ts
// Regra: um ADMIN nunca se avalia a si próprio nas avaliações do módulo
// `evaluation` (desempenho, onboarding, etc.) — a avaliação de um
// administrador tem de ser feita por OUTRO administrador. A única
// autoavaliação permitida a um admin é a do módulo Avaliação 360
// (evaluation360), que não passa por aqui.

import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ADMIN_ROLE = 'ADMIN';

export const ADMIN_SELF_EVAL_MESSAGE =
  'Um administrador não pode avaliar-se a si próprio. A avaliação tem de ser feita por outro administrador.';
export const ADMIN_EVALUATOR_MESSAGE =
  'A avaliação de um administrador tem de ser feita por outro administrador.';

export async function assertAdminEvaluatedByOtherAdmin(
  prisma: PrismaService,
  evaluatorId: number,
  evaluatedId: number,
): Promise<void> {
  const users = await prisma.read.user.findMany({
    where: { id: { in: [evaluatorId, evaluatedId] } },
    select: { id: true, role: { select: { name: true } } },
  });
  const evaluated = users.find(u => u.id === evaluatedId);
  if (evaluated?.role?.name !== ADMIN_ROLE) return;
  if (evaluatorId === evaluatedId) throw new BadRequestException(ADMIN_SELF_EVAL_MESSAGE);
  const evaluator = users.find(u => u.id === evaluatorId);
  if (evaluator?.role?.name !== ADMIN_ROLE) {
    throw new BadRequestException(ADMIN_EVALUATOR_MESSAGE);
  }
}

/** Ids dos administradores activos (para escolher avaliador de um admin). */
export async function findActiveAdminIds(prisma: PrismaService): Promise<number[]> {
  const admins = await prisma.read.user.findMany({
    where: { active: true, role: { name: ADMIN_ROLE } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return admins.map(a => a.id);
}
