// src/process-standard/process-activation.ts
// Sincroniza o estado das etapas de uma instância depois de qualquer
// transição (conclusão, devolução, reabertura, cancelamento): activa as
// etapas cujas dependências ficaram satisfeitas, devolve a "à espera" as que
// deixaram de estar, fecha/reabre a instância e actualiza o responsável actual.
// Lê sempre da base primária — acaba de escrever.
import { PrismaService } from '../prisma/prisma.service';
import { isActiveStatus, planActivation } from './process-workflow';

export interface ActivationResult {
  activatedStepIds: number[];
  instanceCompleted: boolean;
  instanceReopened: boolean;
}

export async function syncStepActivation(
  prisma: PrismaService,
  instanceId: number,
): Promise<ActivationResult> {
  const progress = await prisma.stepProgress.findMany({
    where: { instanceId },
    select: {
      id: true,
      stepId: true,
      stepOrder: true,
      status: true,
      assigneeId: true,
      step: {
        select: { id: true, order: true, title: true, parallel: true, dependsOnOrders: true },
      },
    },
  });
  const inst = await prisma.processInstance.findUnique({
    where: { id: instanceId },
    select: { status: true },
  });

  const result: ActivationResult = {
    activatedStepIds: [],
    instanceCompleted: false,
    instanceReopened: false,
  };
  if (!inst) return result;

  // Só uma instância em execução avança etapas.
  if (inst.status === 'IN_PROGRESS' || inst.status === 'COMPLETED') {
    const { activate, demote } = planActivation(
      progress.map(p => p.step),
      progress,
    );
    if (activate.length) {
      await prisma.stepProgress.updateMany({
        where: { id: { in: activate } },
        data: { status: 'PENDING', startedAt: new Date() },
      });
      result.activatedStepIds = progress.filter(p => activate.includes(p.id)).map(p => p.stepId);
      for (const p of progress) if (activate.includes(p.id)) p.status = 'PENDING';
    }
    if (demote.length) {
      await prisma.stepProgress.updateMany({
        where: { id: { in: demote } },
        data: { status: 'WAITING', startedAt: null },
      });
      for (const p of progress) if (demote.includes(p.id)) p.status = 'WAITING';
    }
  }

  const open = progress.filter(p => !['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(p.status));
  if (open.length === 0 && progress.length > 0 && inst.status === 'IN_PROGRESS') {
    await prisma.processInstance.update({
      where: { id: instanceId },
      data: { status: 'COMPLETED', completedAt: new Date(), currentResponsibleId: null },
    });
    result.instanceCompleted = true;
    return result;
  }
  if (open.length > 0 && inst.status === 'COMPLETED') {
    await prisma.processInstance.update({
      where: { id: instanceId },
      data: { status: 'IN_PROGRESS', completedAt: null },
    });
    result.instanceReopened = true;
  }

  const current = [...progress]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .find(p => isActiveStatus(p.status) && p.assigneeId != null);
  await prisma.processInstance.update({
    where: { id: instanceId },
    data: { currentResponsibleId: current?.assigneeId ?? null },
  });
  return result;
}
