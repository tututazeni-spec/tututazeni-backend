// modulo_monitoring.md §3 — Processos (ligação directa ao módulo Processes).
//
// Só lê: ProcessInstance / StepProgress / ProcessIntegrationLog. O Monitoring
// não executa nem altera processos — mostra o que está a correr, atrasado,
// bloqueado ou em risco de SLA, e quem é o responsável.
//
// Definições (documentadas porque os números dependem delas):
//  - atrasado: IN_PROGRESS com slaDeadline no passado;
//  - em risco: IN_PROGRESS com slaDeadline nas próximas 24h;
//  - bloqueado: instância ON_HOLD, ou com pelo menos uma etapa BLOCKED/ESCALATED;
//  - taxa de conclusão (30d): concluídos / (concluídos + cancelados + ainda activos
//    iniciados na janela); tempo médio: média de completedAt − startedAt dos
//    concluídos na janela;
//  - falhas: etapas REJECTED na janela + falhas de integração (ProcessIntegrationLog).

import { Injectable } from '@nestjs/common';
import type { StepProgressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { percent } from './monitoring-status';

const H = 3_600_000;
const D = 24 * H;
const LIST_LIMIT = 15;
const DURATION_SAMPLE = 5000;

@Injectable()
export class MonitoringProcessesService {
  constructor(private readonly prisma: PrismaService) {}

  private round1(n: number) {
    return Math.round(n * 10) / 10;
  }

  async getProcesses() {
    const r = this.prisma.read;
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * H);
    const since30 = new Date(now.getTime() - 30 * D);

    const overdueWhere = { status: 'IN_PROGRESS' as const, slaDeadline: { lt: now } };
    const atRiskWhere = {
      status: 'IN_PROGRESS' as const,
      slaDeadline: { gte: now, lte: in24h },
    };
    const blockedWhere = {
      OR: [
        { status: 'ON_HOLD' as const },
        {
          status: 'IN_PROGRESS' as const,
          stepProgress: {
            some: { status: { in: ['BLOCKED', 'ESCALATED'] as StepProgressStatus[] } },
          },
        },
      ],
    };
    const instanceSelect = {
      id: true,
      code: true,
      title: true,
      status: true,
      priority: true,
      startedAt: true,
      slaDeadline: true,
      suspendedAt: true,
      process: { select: { title: true } },
      currentResponsible: { select: { id: true, fullName: true } },
    } as const;

    const [
      running,
      onHold,
      completed30,
      cancelled30,
      started30,
      overdue,
      atRisk,
      blocked,
      pendingSteps,
      blockedSteps,
      rejectedSteps30,
      integrationFailed30,
      completedSample,
      slaMet30,
      overdueList,
      blockedList,
      overdueByResponsible,
    ] = await Promise.all([
      r.processInstance.count({ where: { status: 'IN_PROGRESS' } }),
      r.processInstance.count({ where: { status: 'ON_HOLD' } }),
      r.processInstance.count({ where: { status: 'COMPLETED', completedAt: { gte: since30 } } }),
      r.processInstance.count({ where: { status: 'CANCELLED', cancelledAt: { gte: since30 } } }),
      r.processInstance.count({ where: { startedAt: { gte: since30 } } }),
      r.processInstance.count({ where: overdueWhere }),
      r.processInstance.count({ where: atRiskWhere }),
      r.processInstance.count({ where: blockedWhere }),
      r.stepProgress.count({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS', 'WAITING'] },
          instance: { status: 'IN_PROGRESS' },
        },
      }),
      r.stepProgress.count({
        where: { status: { in: ['BLOCKED', 'ESCALATED'] }, instance: { status: 'IN_PROGRESS' } },
      }),
      r.stepProgress.count({ where: { status: 'REJECTED', completedAt: { gte: since30 } } }),
      r.processIntegrationLog.count({ where: { status: 'FAILED', createdAt: { gte: since30 } } }),
      r.processInstance.findMany({
        where: { status: 'COMPLETED', completedAt: { gte: since30 } },
        select: { startedAt: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
        take: DURATION_SAMPLE,
      }),
      r.processInstance.findMany({
        where: { status: 'COMPLETED', completedAt: { gte: since30 }, slaDeadline: { not: null } },
        select: { completedAt: true, slaDeadline: true },
        take: DURATION_SAMPLE,
      }),
      r.processInstance.findMany({
        where: overdueWhere,
        select: instanceSelect,
        orderBy: { slaDeadline: 'asc' },
        take: LIST_LIMIT,
      }),
      r.processInstance.findMany({
        where: blockedWhere,
        select: instanceSelect,
        orderBy: { updatedAt: 'asc' },
        take: LIST_LIMIT,
      }),
      r.processInstance.groupBy({
        by: ['currentResponsibleId'],
        where: { ...overdueWhere, currentResponsibleId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { currentResponsibleId: 'desc' } },
        take: 5,
      }),
    ]);

    const durationsH = completedSample
      .filter(i => i.completedAt)
      .map(i => (i.completedAt.getTime() - i.startedAt.getTime()) / H);
    const avgHours = durationsH.length
      ? this.round1(durationsH.reduce((s, v) => s + v, 0) / durationsH.length)
      : null;

    const metSla = slaMet30.filter(
      i => i.completedAt && i.slaDeadline && i.completedAt <= i.slaDeadline,
    ).length;

    // nomes dos responsáveis com mais atrasos (groupBy não traz relações)
    const respIds = overdueByResponsible
      .map(g => g.currentResponsibleId)
      .filter((id): id is number => id !== null);
    const respUsers = respIds.length
      ? await r.user.findMany({
          where: { id: { in: respIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameOf = new Map(respUsers.map(u => [u.id, u.fullName]));

    const mapInstance = (i: (typeof overdueList)[number]) => ({
      id: i.id,
      code: i.code,
      title: i.title ?? i.process.title,
      process: i.process.title,
      status: i.status,
      priority: i.priority,
      startedAt: i.startedAt,
      slaDeadline: i.slaDeadline,
      hoursOverdue:
        i.slaDeadline && i.slaDeadline < now
          ? this.round1((now.getTime() - i.slaDeadline.getTime()) / H)
          : null,
      responsible: i.currentResponsible
        ? { id: i.currentResponsible.id, name: i.currentResponsible.fullName }
        : null,
    });

    return {
      generatedAt: now.toISOString(),
      summary: {
        running,
        onHold,
        completed30d: completed30,
        cancelled30d: cancelled30,
        overdue,
        atRisk,
        blocked,
        pendingSteps,
        blockedSteps,
        // §3 "Taxa de conclusão": concluídos face ao que foi iniciado/encerrado na janela
        completionRatePercent: percent(completed30, completed30 + cancelled30 + running),
        avgCompletionHours: avgHours,
        // §3 "SLA": cumprimento dos processos concluídos que tinham prazo
        slaCompliancePercent: percent(metSla, slaMet30.length),
        started30d: started30,
        failures: {
          rejectedSteps30d: rejectedSteps30,
          integrationFailures30d: integrationFailed30,
          total30d: rejectedSteps30 + integrationFailed30,
        },
      },
      overdue: overdueList.map(mapInstance),
      blocked: blockedList.map(mapInstance),
      overdueByResponsible: overdueByResponsible.map(g => ({
        userId: g.currentResponsibleId,
        name: g.currentResponsibleId ? (nameOf.get(g.currentResponsibleId) ?? null) : null,
        overdue: g._count._all,
      })),
    };
  }
}
