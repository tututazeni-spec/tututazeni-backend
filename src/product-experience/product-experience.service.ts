import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitFeedbackDto, SubmitNpsDto, TrackEventDto } from './product-experience.dto';
import {
  computeNps,
  normalizePath,
  NPS_COOLDOWN_DAYS,
  NPS_MIN_ACCOUNT_AGE_DAYS,
} from './product-experience.math';

const DAY = 864e5;

export interface ChecklistStep {
  key: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
}

@Injectable()
export class ProductExperienceService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Primeiros passos ──
  // Passos calculados a partir de dados reais (não de cliques), para o cliente ver o progresso
  // verdadeiro e o checklist fechar sozinho quando o trabalho está feito.
  async gettingStarted(userId: number, roleName: string | null) {
    const dismissed = await this.prisma.gettingStartedDismissal.findUnique({ where: { userId } });
    const admin = roleName === 'ADMIN' || roleName === 'RH';
    let steps: ChecklistStep[];
    if (admin) {
      const [users, departments, published, enrollments] = await Promise.all([
        this.prisma.user.count({ where: { active: true } }),
        this.prisma.department.count({ where: { active: true } }),
        this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.enrollment.count(),
      ]);
      steps = [
        {
          key: 'departments',
          title: 'Criar o primeiro departamento',
          hint: 'Organize a empresa em equipas.',
          href: '/departments',
          done: departments > 0,
        },
        {
          key: 'users',
          title: 'Adicionar colaboradores',
          hint: 'Convide a sua equipa para começar.',
          href: '/users',
          done: users > 1,
        },
        {
          key: 'course',
          title: 'Publicar o primeiro curso',
          hint: 'Um curso publicado fica logo disponível para inscrição.',
          href: '/courses',
          done: published > 0,
        },
        {
          key: 'enrollment',
          title: 'Inscrever alguém num curso',
          hint: 'Veja o primeiro resultado: progresso e certificado.',
          href: '/enrollments',
          done: enrollments > 0,
        },
      ];
    } else {
      const [enrolled, started] = await Promise.all([
        this.prisma.enrollment.count({ where: { userId } }),
        this.prisma.enrollment.count({ where: { userId, status: { not: 'NOT_STARTED' } } }),
      ]);
      steps = [
        {
          key: 'enroll',
          title: 'Escolher um curso',
          hint: 'Explore o catálogo e inscreva-se.',
          href: '/courses',
          done: enrolled > 0,
        },
        {
          key: 'start',
          title: 'Começar a primeira lição',
          hint: 'Bastam alguns minutos para arrancar.',
          href: '/courses',
          done: started > 0,
        },
      ];
    }
    const doneCount = steps.filter(s => s.done).length;
    return {
      steps,
      doneCount,
      total: steps.length,
      completed: doneCount === steps.length,
      dismissed: !!dismissed,
      next: steps.find(s => !s.done) ?? null,
    };
  }

  async dismissGettingStarted(userId: number) {
    await this.prisma.gettingStartedDismissal.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return { dismissed: true };
  }

  // ── Feedback e sondagem ──
  async submitFeedback(userId: number, dto: SubmitFeedbackDto) {
    const row = await this.prisma.productFeedback.create({
      data: { userId, kind: dto.kind, comment: dto.comment.trim(), page: normalizePath(dto.page) },
    });
    return { id: row.id };
  }

  // Pergunta NPS só a quem tem conta com alguma idade e não respondeu nos últimos 90 dias.
  async npsEligibility(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (!user) return { eligible: false };
    if (Date.now() - user.createdAt.getTime() < NPS_MIN_ACCOUNT_AGE_DAYS * DAY)
      return { eligible: false };
    const last = await this.prisma.productFeedback.findFirst({
      where: { userId, kind: 'NPS' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return { eligible: !last || Date.now() - last.createdAt.getTime() >= NPS_COOLDOWN_DAYS * DAY };
  }

  async submitNps(userId: number, dto: SubmitNpsDto) {
    const row = await this.prisma.productFeedback.create({
      data: {
        userId,
        kind: 'NPS',
        score: dto.score,
        comment: dto.comment?.trim() || null,
        page: normalizePath(dto.page),
      },
    });
    return { id: row.id };
  }

  // ── Uso ──
  async track(userId: number, dto: TrackEventDto) {
    const path = normalizePath(dto.path);
    if (!path) return { ok: false };
    await this.prisma.productUsageEvent.create({ data: { userId, event: dto.event, path } });
    return { ok: true };
  }

  async summary(days = 30) {
    const since = new Date(Date.now() - days * DAY);
    const [events, feedback, npsRows] = await Promise.all([
      this.prisma.productUsageEvent.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true, path: true, createdAt: true },
      }),
      this.prisma.productFeedback.groupBy({
        by: ['kind'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.productFeedback.findMany({
        where: { kind: 'NPS', createdAt: { gte: since }, score: { not: null } },
        select: { score: true },
      }),
    ]);
    const perPath = new Map<string, number>();
    const perDay = new Map<string, Set<number>>();
    const active = new Set<number>();
    for (const e of events) {
      if (e.path) perPath.set(e.path, (perPath.get(e.path) ?? 0) + 1);
      if (e.userId != null) {
        active.add(e.userId);
        const d = e.createdAt.toISOString().slice(0, 10);
        if (!perDay.has(d)) perDay.set(d, new Set());
        perDay.get(d)!.add(e.userId);
      }
    }
    return {
      days,
      activeUsers: active.size,
      pageViews: events.length,
      topPages: [...perPath.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, views]) => ({ path, views })),
      dailyActiveUsers: [...perDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, set]) => ({ day, users: set.size })),
      feedbackByKind: Object.fromEntries(feedback.map(f => [f.kind, f._count._all])),
      nps: computeNps(npsRows.map(r => r.score as number)),
    };
  }

  async listFeedback(kind?: string, limit = 50) {
    return this.prisma.productFeedback.findMany({
      where: kind ? { kind } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        kind: true,
        score: true,
        comment: true,
        page: true,
        createdAt: true,
        user: { select: { id: true, fullName: true } },
      },
    });
  }
}
