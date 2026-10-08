// src/process-standard/process-assignments.ts
// Histórico de atribuições e delegações (docs/Modulo_Processes.md §17,
// ProcessAssignment). A atribuição vigente continua nas tabelas do motor; isto
// regista quem passou a ser responsável e fecha a atribuição anterior.
import { PrismaService } from '../prisma/prisma.service';

export type AssignmentKind = 'RESPONSIBLE' | 'APPROVER' | 'DELEGATE' | 'TEAM';

export interface AssignmentEntry {
  instanceId: number;
  stepId?: number | null;
  kind: AssignmentKind;
  assigneeId?: number | null;
  teamDepartmentId?: number | null;
  delegatedFromId?: number | null;
  assignedById: number;
  reason?: string | null;
}

/** Fecha as atribuições activas do mesmo âmbito (instância/etapa/tipo) e abre a nova. */
export async function recordAssignment(prisma: PrismaService, e: AssignmentEntry) {
  const now = new Date();
  const scope = {
    instanceId: e.instanceId,
    stepId: e.stepId ?? null,
    kind: e.kind,
    active: true,
  };
  await prisma.processAssignment.updateMany({
    where: scope,
    data: { active: false, endsAt: now },
  });
  return prisma.processAssignment.create({
    data: {
      instanceId: e.instanceId,
      stepId: e.stepId ?? null,
      kind: e.kind,
      assigneeId: e.assigneeId ?? null,
      teamDepartmentId: e.teamDepartmentId ?? null,
      delegatedFromId: e.delegatedFromId ?? null,
      assignedById: e.assignedById,
      reason: e.reason?.trim() || null,
      startsAt: now,
    },
  });
}
