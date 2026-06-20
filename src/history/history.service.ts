// src/history/history.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  HistoryFilterDto,
  TimelineFilterDto,
  HistoryCreateEventDto,
  EventCategory,
  EventModule,
} from './history.dto';

// ─── Helpers ─────────────────────────────────────────────────────

/** Map raw AuditLog action → EventCategory */
function categorise(action: string, entity: string): EventCategory {
  const a = action.toUpperCase();
  const e = entity.toUpperCase();

  if (
    ['ENROLLMENT', 'COURSE', 'LESSON', 'CERTIFICATE', 'BADGE', 'ASSESSMENT'].some(
      k => e.includes(k) || a.includes(k),
    )
  )
    return EventCategory.LEARNING;
  if (
    ['PERFORMANCE', 'EVALUATION', 'CALIBRATION', 'FEEDBACK'].some(
      k => a.includes(k) || e.includes(k),
    )
  )
    return EventCategory.PERFORMANCE;
  if (
    ['PROMOTION', 'HIRE', 'TRANSFER', 'TERMINATION', 'POSITION', 'SALARY', 'CAREER', 'PDI'].some(
      k => a.includes(k),
    )
  )
    return EventCategory.CAREER;
  if (['SURVEY', 'ENGAGEMENT', 'RECOGNITION', 'MOOD', 'FEEDBACK'].some(k => a.includes(k)))
    return EventCategory.ENGAGEMENT;
  if (['PAYSLIP', 'INVOICE', 'PAYROLL', 'SUBSIDY'].some(k => a.includes(k)))
    return EventCategory.FINANCIAL;
  if (
    ['DOCUMENT', 'CONTRACT', 'COMPLIANCE', 'CONTENT_BOOKMARK', 'CONTENT_VIEW'].some(k =>
      a.includes(k),
    )
  )
    return EventCategory.COMPLIANCE;
  if (['LEAVE', 'ATTENDANCE', 'ABSENCE', 'VACATION'].some(k => a.includes(k)))
    return EventCategory.ATTENDANCE;
  if (['AVATAR', 'SESSION', 'SIMULATION'].some(k => a.includes(k))) return EventCategory.ENGAGEMENT;
  return EventCategory.SYSTEM;
}

/** Derive module from entity/action */
function deriveModule(action: string, entity: string): EventModule {
  const e = entity.toUpperCase();
  const a = action.toUpperCase();
  if (
    ['ENROLLMENT', 'COURSE', 'LESSON', 'CERTIFICATE', 'LEARNING'].some(
      k => e.includes(k) || a.includes(k),
    )
  )
    return EventModule.LMS;
  if (['PERFORMANCE', 'EVALUATION'].some(k => a.includes(k) || e.includes(k)))
    return EventModule.PERFORMANCE;
  if (['AVATAR', 'SESSION'].some(k => a.includes(k))) return EventModule.AVATAR;
  if (['PAYSLIP', 'PAYROLL'].some(k => a.includes(k))) return EventModule.PAYROLL;
  if (['DOCUMENT', 'CONTRACT'].some(k => a.includes(k))) return EventModule.DOCUMENTS;
  if (['SURVEY', 'RECOGNITION', 'MOOD', 'ENGAGEMENT'].some(k => a.includes(k)))
    return EventModule.ENGAGEMENT;
  if (['PDI', 'DEVELOPMENT', 'CAREER', 'SUCCESSION', 'TALENT'].some(k => a.includes(k)))
    return EventModule.TALENT;
  if (['USER', 'PERMISSION', 'ROLE', 'ADMIN', 'CONFIG'].some(k => a.includes(k)))
    return EventModule.SYSTEM;
  return EventModule.HR;
}

/** Impact score heuristic */
function impactScore(action: string, entity: string): number {
  const a = action.toUpperCase();
  if (a.includes('PROMOTION') || a.includes('HIRE') || a.includes('TERMINATION')) return 90;
  if (a.includes('COMPLETED') || a.includes('CERTIFICATE')) return 80;
  if (a.includes('EVALUATION') || a.includes('CALIBRATION')) return 75;
  if (a.includes('PDI') || a.includes('DEVELOPMENT')) return 65;
  if (a.includes('BADGE') || a.includes('RECOGNITION')) return 60;
  if (a.includes('ENROLLMENT') || a.includes('SURVEY')) return 40;
  if (a.includes('CONTENT_VIEW') || a.includes('LOGIN')) return 10;
  return 30;
}

/** Emoji icon for event type */
function eventIcon(category: EventCategory, action: string): string {
  const a = action.toUpperCase();
  if (a.includes('COMPLETED') || a.includes('CONCLUIDO')) return '✅';
  if (a.includes('PROMOTION')) return '🚀';
  if (a.includes('CERTIFICATE')) return '🎓';
  if (a.includes('BADGE')) return '🏅';
  if (a.includes('RECOGNITION')) return '🏆';
  if (a.includes('PDI')) return '🎯';
  if (a.includes('HIRE')) return '👋';
  if (a.includes('LEAVE')) return '🌴';
  if (a.includes('EVALUATION')) return '⭐';
  if (category === EventCategory.LEARNING) return '📚';
  if (category === EventCategory.PERFORMANCE) return '📈';
  if (category === EventCategory.CAREER) return '🛤️';
  if (category === EventCategory.ENGAGEMENT) return '💬';
  if (category === EventCategory.SYSTEM) return '⚙️';
  return '📌';
}

/** Human-readable title from action+entity */
function buildTitle(action: string, entity: string): string {
  const a = action.toUpperCase();
  if (a === 'CONTENT_VIEW') return `Conteúdo visualizado`;
  if (a === 'CONTENT_BOOKMARK') return `Conteúdo guardado nos favoritos`;
  if (a.includes('ENROLLMENT')) return `Inscrição em curso`;
  if (a.includes('COURSE_COMPLETED') || a === 'CONCLUIDO') return `Curso concluído`;
  if (a.includes('CERTIFICATE')) return `Certificado obtido`;
  if (a.includes('BADGE')) return `Badge conquistado`;
  if (a.includes('RECOGNITION')) return `Reconhecimento recebido`;
  if (a.includes('EVALUATION')) return `Avaliação 360° submetida`;
  if (a.includes('CALIBRATION')) return `Score calibrado`;
  if (a.includes('PDI')) return `Actividade de PDI`;
  if (a.includes('PAYSLIP')) return `Recibo salarial processado`;
  if (a.includes('LEAVE')) return `Pedido de ausência`;
  if (a.includes('AVATAR')) return `Sessão de treino com avatar`;
  if (a === 'REPORT_SAVED') return `Relatório guardado`;
  return `${action} em ${entity}`;
}

// Enrich a raw AuditLog entry with derived fields
function enrichEntry(log: any): any {
  const category = categorise(log.action, log.entity);
  const module = deriveModule(log.action, log.entity);
  const impact = impactScore(log.action, log.entity);
  const title = buildTitle(log.action, log.entity);
  const icon = eventIcon(category, log.action);

  return {
    id: log.id,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    timestamp: log.timestamp,
    userId: log.userId,
    user: log.user ?? null,
    category,
    module,
    impactScore: impact,
    title,
    icon,
    description: log.changes ?? log.reason ?? null,
    metadata: log.metadata ?? null,
    milestone: impact >= 75,
  };
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // AUDIT LOG — CRUD
  // ══════════════════════════════════════════════════════

  async findAll(filters: HistoryFilterDto) {
    const {
      page = 1,
      limit = 30,
      userId,
      entity,
      action,
      from,
      to,
      search,
      category,
      module,
    } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = { contains: entity, mode: 'insensitive' };
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { changes: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [raw, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    let data = raw.map(enrichEntry);

    // Post-filter by category/module if provided (derived fields)
    if (category) data = data.filter(d => d.category === category);
    if (module) data = data.filter(d => d.module === module);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getUserActivity(userId: number, limit = 50) {
    const raw = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return raw.map(enrichEntry);
  }

  async getEntityHistory(entity: string, entityId: number) {
    const raw = await this.prisma.auditLog.findMany({
      where: { entity, entityId },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { timestamp: 'desc' },
    });
    return raw.map(enrichEntry);
  }

  async createEvent(dto: HistoryCreateEventDto) {
    const entry = await this.prisma.auditLog.create({
      data: {
        userId: dto.userId,
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId,
        changes: dto.description,
        reason: dto.metadata,
      },
    });
    return enrichEntry(entry);
  }

  // ══════════════════════════════════════════════════════
  // SMART TIMELINE (aggregated multi-source)
  // ══════════════════════════════════════════════════════

  async getUserTimeline(userId: number, filters: TimelineFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: any = { userId };
    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) where.timestamp.gte = new Date(filters.from);
      if (filters.to) where.timestamp.lte = new Date(filters.to);
    }

    // --- Source 1: AuditLog (system events) ---
    const auditEntries = await this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 200,
    });

    // --- Source 2: Enrollments ---
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, ...(filters.from && { enrolledAt: { gte: new Date(filters.from) } }) },
      include: { course: { select: { id: true, title: true, category: true } } },
      orderBy: { enrolledAt: 'desc' },
      take: 50,
    });

    // --- Source 3: Performance reviews ---
    const reviews = await this.prisma.performanceReview.findMany({
      where: { userId, ...(filters.from && { createdAt: { gte: new Date(filters.from) } }) },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // --- Source 4: Badges ---
    const badges = await this.prisma.badgeAward.findMany({
      where: { userId, ...(filters.from && { awardedAt: { gte: new Date(filters.from) } }) },
      include: { badge: true },
      orderBy: { awardedAt: 'desc' },
      take: 20,
    });

    // --- Source 5: Development plans ---
    const plans = await this.prisma.developmentPlan.findMany({
      where: {
        userId,
        isTemplate: false,
        ...(filters.from && { createdAt: { gte: new Date(filters.from) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // --- Source 6: Avatar sessions ---
    const avatarSessions = await (this.prisma as any).avatarSession.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        ...(filters.from && { completedAt: { gte: new Date(filters.from) } }),
      },
      // AvatarScenario não tem campo category — só title é usado no merge
      include: { scenario: { select: { title: true } } },
      orderBy: { completedAt: 'desc' },
      take: 20,
    });

    // --- Source 7: Certificates ---
    const certs = await this.prisma.certificate
      .findMany({
        where: { userId, ...(filters.from && { issuedAt: { gte: new Date(filters.from) } }) },
        orderBy: { issuedAt: 'desc' },
        take: 20,
      })
      .catch(() => [] as any[]);

    // ── Merge into unified timeline events ──────────────

    const events: any[] = [];

    // AuditLog events
    for (const e of auditEntries) {
      const cat = categorise(e.action, e.entity);
      if (filters.category && cat !== filters.category) continue;
      events.push({
        id: `audit-${e.id}`,
        source: 'AUDIT',
        timestamp: e.timestamp,
        ...enrichEntry(e),
      });
    }

    // Enrollment events
    for (const e of enrollments) {
      if (filters.category && filters.category !== EventCategory.LEARNING) continue;
      const completed = e.status === 'CONCLUIDO';
      events.push({
        id: `enroll-${e.id}`,
        source: 'ENROLLMENT',
        timestamp: e.enrolledAt,
        category: EventCategory.LEARNING,
        module: EventModule.LMS,
        impactScore: completed ? 70 : 40,
        milestone: completed,
        icon: completed ? '✅' : '📚',
        title: completed
          ? `Curso concluído: ${e.course?.title}`
          : `Inscrito em: ${e.course?.title}`,
        action: e.status,
        entity: 'Enrollment',
        entityId: e.id,
        userId,
      });
    }

    // Performance review events
    for (const r of reviews) {
      if (filters.category && filters.category !== EventCategory.PERFORMANCE) continue;
      events.push({
        id: `perf-${r.id}`,
        source: 'PERFORMANCE',
        timestamp: r.createdAt,
        category: EventCategory.PERFORMANCE,
        module: EventModule.PERFORMANCE,
        impactScore: 75,
        milestone: (r.score ?? 0) >= 4,
        icon: '⭐',
        title: `Avaliação de performance: ${r.score?.toFixed(1) ?? '–'}/5`,
        action: 'PERFORMANCE_REVIEW',
        entity: 'PerformanceReview',
        entityId: r.id,
        userId,
      });
    }

    // Badge events
    for (const b of badges) {
      if (filters.category && filters.category !== EventCategory.ENGAGEMENT) continue;
      events.push({
        id: `badge-${b.id}`,
        source: 'BADGE',
        timestamp: b.awardedAt,
        category: EventCategory.ENGAGEMENT,
        module: EventModule.LMS,
        impactScore: 60,
        milestone: true,
        icon: '🏅',
        title: `Badge conquistado: ${b.badge?.name ?? 'Badge'}`,
        action: 'BADGE_AWARDED',
        entity: 'BadgeAward',
        entityId: b.id,
        userId,
      });
    }

    // Development plans
    for (const p of plans) {
      if (filters.category && filters.category !== EventCategory.CAREER) continue;
      events.push({
        id: `plan-${p.id}`,
        source: 'DEVELOPMENT_PLAN',
        timestamp: p.createdAt,
        category: EventCategory.CAREER,
        module: EventModule.TALENT,
        impactScore: 65,
        milestone: p.status === 'COMPLETED',
        icon: '🎯',
        title: p.status === 'COMPLETED' ? `PDI concluído: ${p.name}` : `PDI criado: ${p.name}`,
        action: `PDI_${p.status}`,
        entity: 'DevelopmentPlan',
        entityId: p.id,
        userId,
      });
    }

    // Avatar sessions
    for (const s of avatarSessions) {
      if (filters.category && filters.category !== EventCategory.ENGAGEMENT) continue;
      events.push({
        id: `avatar-${s.id}`,
        source: 'AVATAR',
        timestamp: s.completedAt ?? s.startedAt,
        category: EventCategory.ENGAGEMENT,
        module: EventModule.AVATAR,
        impactScore: 50,
        milestone: (s.score ?? 0) >= 80,
        icon: '🤖',
        title: `Simulação concluída: ${s.scenario?.title ?? 'Avatar Training'}${s.score ? ` (${s.score}pts)` : ''}`,
        action: 'AVATAR_SESSION_COMPLETED',
        entity: 'AvatarSession',
        entityId: s.id,
        userId,
      });
    }

    // Certificates
    for (const c of certs as any[]) {
      if (filters.category && filters.category !== EventCategory.LEARNING) continue;
      events.push({
        id: `cert-${c.id}`,
        source: 'CERTIFICATE',
        timestamp: c.issuedAt,
        category: EventCategory.LEARNING,
        module: EventModule.LMS,
        impactScore: 85,
        milestone: true,
        icon: '🎓',
        title: `Certificado emitido`,
        action: 'CERTIFICATE_ISSUED',
        entity: 'UserCertificate',
        entityId: c.id,
        userId,
      });
    }

    // Sort all by timestamp desc, paginate
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const total = events.length;
    const paged = events.slice(skip, skip + limit);

    // Group by month for frontend grouping
    const grouped: Record<string, any[]> = {};
    for (const e of paged) {
      const key = new Date(e.timestamp).toISOString().slice(0, 7); // YYYY-MM
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    }

    return {
      data: paged,
      grouped: Object.entries(grouped).map(([month, items]) => ({ month, items })),
      milestones: paged.filter(e => e.milestone),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // Team timeline (manager view)
  async getTeamTimeline(managerId: number, filters: TimelineFilterDto) {
    const team = await this.prisma.user.findMany({
      where: { managerId, active: true },
      select: { id: true, fullName: true, avatarUrl: true },
    });
    if (!team.length) return { data: [], meta: {} };

    const teamIds = team.map(u => u.id);
    const where: any = { userId: { in: teamIds } };
    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) where.timestamp.gte = new Date(filters.from);
      if (filters.to) where.timestamp.lte = new Date(filters.to);
    }

    const { page = 1, limit = 30 } = filters;
    const skip = (page - 1) * limit;

    const [raw, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      teamSize: team.length,
      data: raw.map(enrichEntry),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ══════════════════════════════════════════════════════
  // MILESTONES
  // ══════════════════════════════════════════════════════

  async getUserMilestones(userId: number) {
    const [completedPlans, certs, badges, promotions, highPerfReviews] = await Promise.all([
      this.prisma.developmentPlan.findMany({
        where: { userId, status: 'COMPLETED', isTemplate: false },
        select: { id: true, name: true, completedAt: true, createdAt: true },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.certificate
        .findMany({
          where: { userId },
          orderBy: { issuedAt: 'desc' },
        })
        .catch(() => [] as any[]),
      this.prisma.badgeAward.findMany({
        where: { userId },
        include: { badge: true },
        orderBy: { awardedAt: 'desc' },
      }),
      // Promotions via HistoryRecord
      this.prisma.historyRecord
        .findMany({
          where: { userId, action: { contains: 'PROMOTION' } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
        .catch(() => [] as any[]),
      this.prisma.performanceReview.findMany({
        where: { userId, score: { gte: 4 } },
        select: { id: true, score: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const milestones: any[] = [];

    for (const p of completedPlans) {
      milestones.push({
        type: 'PDI_COMPLETED',
        icon: '🎯',
        title: `PDI Concluído: ${p.name}`,
        date: p.completedAt ?? p.createdAt,
        impactScore: 80,
      });
    }
    for (const c of certs as any[]) {
      milestones.push({
        type: 'CERTIFICATE',
        icon: '🎓',
        title: `Certificado Obtido`,
        date: c.issuedAt,
        impactScore: 85,
      });
    }
    for (const b of badges) {
      milestones.push({
        type: 'BADGE',
        icon: '🏅',
        title: `Badge: ${b.badge?.name}`,
        date: b.awardedAt,
        impactScore: 60,
      });
    }
    for (const r of promotions as any[]) {
      milestones.push({
        type: 'PROMOTION',
        icon: '🚀',
        title: 'Promoção',
        date: r.createdAt,
        impactScore: 95,
      });
    }
    for (const r of highPerfReviews) {
      milestones.push({
        type: 'HIGH_PERFORMANCE',
        icon: '⭐',
        title: `Score de Performance: ${r.score?.toFixed(1)}`,
        date: r.createdAt,
        impactScore: 75,
      });
    }

    return milestones.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS (activity heatmap + stats)
  // ══════════════════════════════════════════════════════

  async getUserActivityStats(userId: number) {
    const yearAgo = new Date(Date.now() - 365 * 86400000);

    const [allLogs, enrollments, completions, badges, points] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { userId, timestamp: { gte: yearAgo } },
        select: { timestamp: true, action: true },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.enrollment.count({ where: { userId } }),
      this.prisma.enrollment.count({ where: { userId, status: 'CONCLUIDO' } }),
      this.prisma.badgeAward.count({ where: { userId } }),
      this.prisma.userPoints.findUnique({ where: { userId } }),
    ]);

    // Daily activity heatmap (last 365 days)
    const dayMap: Record<string, number> = {};
    for (const l of allLogs) {
      const day = l.timestamp.toISOString().split('T')[0];
      dayMap[day] = (dayMap[day] ?? 0) + 1;
    }

    // Streak: consecutive days with activity
    const sortedDays = Object.keys(dayMap).sort().reverse();
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let current = today;
    for (const day of sortedDays) {
      if (day === current) {
        streak++;
        const d = new Date(current);
        d.setDate(d.getDate() - 1);
        current = d.toISOString().split('T')[0];
      } else break;
    }

    // Category breakdown
    const byCategory: Record<string, number> = {};
    for (const l of allLogs) {
      const cat = categorise(l.action, l.action);
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }

    return {
      userId,
      totalEvents: allLogs.length,
      streak,
      activeDays: Object.keys(dayMap).length,
      enrollments,
      completions,
      completionRate: enrollments > 0 ? +((completions / enrollments) * 100).toFixed(1) : 0,
      badges,
      xpPoints: points?.points ?? 0,
      heatmap: dayMap,
      byCategory,
      mostActiveDay: Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    };
  }

  // ══════════════════════════════════════════════════════
  // UPCOMING EVENTS (anniversaries, expiring, etc.)
  // ══════════════════════════════════════════════════════

  async getUpcomingEvents() {
    const now = new Date();
    const month = now.getMonth() + 1;

    const [anniversaries, expiring] = await Promise.all([
      // Anniversaries based on createdAt (proxy for hire date)
      this.prisma.user
        .findMany({
          where: { active: true },
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            createdAt: true,
            department: { select: { name: true } },
          },
        })
        .then(users =>
          users
            .filter(u => new Date(u.createdAt).getMonth() + 1 === month)
            .map(u => ({
              type: 'ANNIVERSARY',
              icon: '🎉',
              userId: u.id,
              fullName: u.fullName,
              avatarUrl: u.avatarUrl,
              dept: u.department?.name,
              years: now.getFullYear() - new Date(u.createdAt).getFullYear(),
              date: u.createdAt,
            }))
            .filter(u => u.years > 0)
            .sort((a, b) => b.years - a.years),
        ),
      // Certificates expiring in next 30 days
      this.prisma.certificate
        .findMany({
          where: { expiresAt: { gte: now, lte: new Date(Date.now() + 30 * 86400000) } },
          include: { user: { select: { id: true, fullName: true } } },
        })
        .catch(() => [] as any[]),
    ]);

    return { anniversaries, expiringCertificates: expiring };
  }

  // ══════════════════════════════════════════════════════
  // AUDIT LOG STATS (for admins)
  // ══════════════════════════════════════════════════════

  async getAuditStats(from?: string, to?: string) {
    const where: any = {};
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const [total, byAction, topUsers, recentAlerts] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog
        .groupBy({
          by: ['action'],
          where,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        })
        .catch(() => [] as any[]),
      this.prisma.auditLog
        .groupBy({
          by: ['userId'],
          where,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        })
        .then(async rows => {
          const ids = rows.map(r => r.userId).filter(Boolean);
          const users = await this.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, fullName: true },
          });
          const uMap = new Map(users.map(u => [u.id, u]));
          return rows.map(r => ({ user: uMap.get(r.userId), count: r._count.id }));
        })
        .catch(() => [] as any[]),
      this.prisma.auditLog
        .findMany({
          where: {
            action: {
              in: ['PERMISSION_CHANGED', 'ADMIN_ACTION', 'USER_DELETED', 'BULK_OPERATION'],
            },
            ...where,
          },
          orderBy: { timestamp: 'desc' },
          take: 5,
          include: { user: { select: { id: true, fullName: true } } },
        })
        .catch(() => [] as any[]),
    ]);

    return {
      total,
      byAction: (byAction as any[]).map((r: any) => ({ action: r.action, count: r._count.id })),
      topUsers,
      recentAlerts,
      generatedAt: new Date(),
    };
  }
}
