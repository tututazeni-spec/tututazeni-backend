// src/search/search.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GlobalSearchDto, TypedSearchDto, SearchEntityType } from './search.dto';

// ─── Helpers ─────────────────────────────────────────────────────

const iLike = (q: string) => ({ contains: q, mode: 'insensitive' as const });

function safeM(prisma: any, name: string) {
  return (
    prisma[name] ?? {
      findMany: async () => [],
      count: async () => 0,
      findFirst: async () => null,
    }
  );
}

/** Compute a simple relevance score (0–100) based on field match quality */
function relevanceScore(item: any, q: string, fields: string[]): number {
  const lq = q.toLowerCase();
  let score = 0;
  for (const f of fields) {
    const val = (item[f] ?? '').toLowerCase();
    if (val === lq)
      score += 100; // exact match
    else if (val.startsWith(lq))
      score += 60; // prefix match
    else if (val.includes(lq)) score += 30; // contains
  }
  return score;
}

/** Normalise a result to the standard shape */
function normalise(
  type: SearchEntityType,
  id: number | string,
  title: string,
  subtitle: string,
  extra: Record<string, any> = {},
  url?: string,
): any {
  return { type, id, title, subtitle: subtitle || '', url: url ?? `/${type}s/${id}`, ...extra };
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class SearchService {
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // GLOBAL SEARCH (multi-entity)
  // ══════════════════════════════════════════════════════

  async globalSearch(q: string, userId: number, dto: Partial<GlobalSearchDto> = {}) {
    if (!q || q.length < 2) return { query: q, results: [], counts: {}, total: 0 };

    const limit = dto.limit ?? 5;
    const types = dto.types ?? Object.values(SearchEntityType);

    // Track search (fire-and-forget)
    this.trackSearch(userId, q, 'global').catch(() => {});

    const fetchers: Promise<any[]>[] = [];

    if (types.includes(SearchEntityType.USER))
      fetchers.push(this.searchUsers(q, { limit, departmentId: dto.departmentId }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.COURSE))
      fetchers.push(this.searchCourses(q, { limit, category: dto.category }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.DOCUMENT))
      fetchers.push(this.searchDocuments(q, { limit }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.CONTENT)) fetchers.push(this.searchContent(q, { limit }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.PDI)) fetchers.push(this.searchPdis(q, { limit, userId }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.COMPETENCY))
      fetchers.push(this.searchCompetencies(q, { limit }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.SCENARIO))
      fetchers.push(this.searchScenarios(q, { limit }));
    else fetchers.push(Promise.resolve([]));

    const [users, courses, documents, content, pdis, competencies, scenarios] =
      await Promise.all(fetchers);

    const allResults = [
      ...users.map(u => ({ ...u, _score: relevanceScore(u, q, ['title', 'subtitle']) })),
      ...courses.map(c => ({ ...c, _score: relevanceScore(c, q, ['title']) })),
      ...documents.map(d => ({ ...d, _score: relevanceScore(d, q, ['title']) })),
      ...content.map(c => ({ ...c, _score: relevanceScore(c, q, ['title']) })),
      ...pdis.map(p => ({ ...p, _score: relevanceScore(p, q, ['title']) })),
      ...competencies.map(c => ({ ...c, _score: relevanceScore(c, q, ['title']) })),
      ...scenarios.map(s => ({ ...s, _score: relevanceScore(s, q, ['title']) })),
    ].sort((a, b) => b._score - a._score);

    return {
      query: q,
      results: allResults,
      counts: {
        users: users.length,
        courses: courses.length,
        documents: documents.length,
        content: content.length,
        pdis: pdis.length,
        competencies: competencies.length,
        scenarios: scenarios.length,
        total: allResults.length,
      },
      grouped: {
        users,
        courses,
        documents,
        content,
        pdis,
        competencies,
        scenarios,
      },
    };
  }

  // ══════════════════════════════════════════════════════
  // TYPE-SPECIFIC SEARCHES
  // ══════════════════════════════════════════════════════

  private async searchUsers(
    q: string,
    opts: { limit: number; departmentId?: number },
  ): Promise<any[]> {
    const where: any = {
      OR: [
        { fullName: iLike(q) },
        { email: iLike(q) },
        { position: { name: iLike(q) } },
        { department: { name: iLike(q) } },
      ],
      active: true,
    };
    if (opts.departmentId) where.departmentId = opts.departmentId;

    const users = await this.prismaRead.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
        points: { select: { points: true } },
      },
      take: opts.limit,
    });

    return users.map(u =>
      normalise(
        SearchEntityType.USER,
        u.id,
        u.fullName,
        [u.position?.name, u.department?.name].filter(Boolean).join(' · '),
        { avatarUrl: u.avatarUrl, xp: u.points?.points ?? 0 },
        `/users/${u.id}`,
      ),
    );
  }

  private async searchCourses(
    q: string,
    opts: { limit: number; category?: string },
  ): Promise<any[]> {
    const where: any = {
      OR: [{ title: iLike(q) }, { description: iLike(q) }, { category: iLike(q) }],
      active: true,
    };
    if (opts.category) where.category = opts.category;

    const courses = await (this.prisma as any).course.findMany({
      where,
      select: {
        id: true,
        title: true,
        category: true,
        workloadHours: true,
        mandatory: true,
        thumbnailUrl: true,
      },
      take: opts.limit,
    });

    return courses.map(c =>
      normalise(
        SearchEntityType.COURSE,
        c.id,
        c.title,
        c.category ?? '',
        { thumbnailUrl: c.thumbnailUrl, mandatory: c.mandatory, workloadHours: c.workloadHours },
        `/courses/${c.id}`,
      ),
    );
  }

  private async searchDocuments(q: string, opts: { limit: number }): Promise<any[]> {
    const articles = await safeM(this.prisma, 'knowledgeArticle')
      .findMany({
        where: { OR: [{ title: iLike(q) }, { description: iLike(q) }, { tags: iLike(q) }] },
        select: { id: true, title: true, description: true, category: true },
        take: opts.limit,
      })
      .catch(() => [] as any[]);

    return (articles as any[]).map((d: any) =>
      normalise(
        SearchEntityType.DOCUMENT,
        d.id,
        d.title,
        d.description ?? d.category ?? '',
        {},
        `/knowledge/${d.id}`,
      ),
    );
  }

  private async searchContent(q: string, opts: { limit: number }): Promise<any[]> {
    const assets = await (this.prisma as any).contentAsset.findMany({
      where: { OR: [{ title: iLike(q) }, { description: iLike(q) }], active: true },
      select: { id: true, title: true, type: true, description: true, thumbnailUrl: true },
      take: opts.limit,
    });

    return assets.map(c =>
      normalise(
        SearchEntityType.CONTENT,
        c.id,
        c.title,
        c.type ?? '',
        { thumbnailUrl: c.thumbnailUrl, description: c.description },
        `/content/${c.id}`,
      ),
    );
  }

  private async searchPdis(q: string, opts: { limit: number; userId: number }): Promise<any[]> {
    const plans = await this.prismaRead.developmentPlan.findMany({
      where: {
        OR: [{ name: iLike(q) }, { goal: iLike(q) }],
        isTemplate: false,
      },
      select: {
        id: true,
        name: true,
        status: true,
        overallProgress: true,
        user: { select: { fullName: true } },
      },
      take: opts.limit,
    });

    return plans.map(p =>
      normalise(
        SearchEntityType.PDI,
        p.id,
        p.name,
        `${p.user?.fullName ?? ''} · ${p.status}`,
        { progress: p.overallProgress },
        `/talent-development/plans/${p.id}`,
      ),
    );
  }

  private async searchCompetencies(q: string, opts: { limit: number }): Promise<any[]> {
    const comps = await (this.prisma as any).competency
      .findMany({
        where: { OR: [{ name: iLike(q) }, { description: iLike(q) }] },
        select: { id: true, name: true, type: true, description: true },
        take: opts.limit,
      })
      .catch(() => [] as any[]);

    return (comps as any[]).map((c: any) =>
      normalise(
        SearchEntityType.COMPETENCY,
        c.id,
        c.name,
        c.type ?? '',
        { description: c.description },
        `/competencies/${c.id}`,
      ),
    );
  }

  private async searchScenarios(q: string, opts: { limit: number }): Promise<any[]> {
    const scenarios = await (this.prisma as any).avatarScenario
      .findMany({
        where: { OR: [{ title: iLike(q) }, { description: iLike(q) }], active: true },
        select: { id: true, title: true, category: true, difficulty: true },
        take: opts.limit,
      })
      .catch(() => [] as any[]);

    return (scenarios as any[]).map((s: any) =>
      normalise(
        SearchEntityType.SCENARIO,
        s.id,
        s.title,
        `${s.category ?? ''} · ${s.difficulty ?? ''}`,
        {},
        `/avatar-training/scenarios/${s.id}`,
      ),
    );
  }

  // ══════════════════════════════════════════════════════
  // TYPED SEARCHES (deep)
  // ══════════════════════════════════════════════════════

  async searchByType(type: SearchEntityType, q: string, userId: number, dto: TypedSearchDto) {
    const { limit = 20, page = 1 } = dto;
    const opts = { limit, departmentId: dto.departmentId, category: dto.category };

    let results: any[] = [];
    switch (type) {
      case SearchEntityType.USER:
        results = await this.searchUsers(q, opts);
        break;
      case SearchEntityType.COURSE:
        results = await this.searchCourses(q, opts);
        break;
      case SearchEntityType.DOCUMENT:
        results = await this.searchDocuments(q, { limit });
        break;
      case SearchEntityType.CONTENT:
        results = await this.searchContent(q, { limit });
        break;
      case SearchEntityType.PDI:
        results = await this.searchPdis(q, { limit, userId });
        break;
      case SearchEntityType.COMPETENCY:
        results = await this.searchCompetencies(q, { limit });
        break;
      case SearchEntityType.SCENARIO:
        results = await this.searchScenarios(q, { limit });
        break;
      default:
        results = [];
    }

    this.trackSearch(userId, q, type).catch(() => {});

    return { query: q, type, results, count: results.length };
  }

  // ══════════════════════════════════════════════════════
  // AUTOCOMPLETE
  // ══════════════════════════════════════════════════════

  async autocomplete(q: string, userId: number, limit = 5) {
    if (q.length < 1) return { suggestions: [] };

    const [users, courses, content] = await Promise.all([
      this.prismaRead.user.findMany({
        where: { fullName: iLike(q), active: true },
        select: { fullName: true },
        take: limit,
      }),
      (this.prisma as any).course.findMany({
        where: { title: iLike(q), active: true },
        select: { title: true },
        take: limit,
      }),
      this.prismaRead.contentAsset.findMany({
        where: { title: iLike(q), active: true },
        select: { title: true },
        take: limit,
      }),
    ]);

    // Recent searches for this user
    const recentHistory = await safeM(this.prisma, 'searchHistory')
      .findMany({
        where: { userId, query: iLike(q) },
        select: { query: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      })
      .catch(() => [] as any[]);

    const allSuggestions = [
      ...(recentHistory as any[]).map((h: any) => ({ text: h.query, type: 'recent' })),
      ...users.map(u => ({ text: u.fullName, type: 'user' })),
      ...courses.map(c => ({ text: c.title, type: 'course' })),
      ...content.map(c => ({ text: c.title, type: 'content' })),
    ];

    // Deduplicate
    const seen = new Set<string>();
    const suggestions = allSuggestions
      .filter(s => {
        if (seen.has(s.text)) return false;
        seen.add(s.text);
        return true;
      })
      .slice(0, limit);

    return { query: q, suggestions };
  }

  // ══════════════════════════════════════════════════════
  // SUGGESTIONS (personalised)
  // ══════════════════════════════════════════════════════

  async getSuggestions(userId: number) {
    const user = await this.prismaRead.user.findUnique({
      where: { id: userId },
      select: {
        departmentId: true,
        userCompetencies: { select: { competencyId: true, currentLevel: true } },
      },
    });

    // Courses not yet enrolled in, matching user's department
    const enrolled = await this.prisma.enrollment
      .findMany({
        where: { userId },
        select: { courseId: true },
      })
      .then(es => es.map(e => e.courseId));

    const suggestedCourses = await (this.prisma as any).course.findMany({
      where: { active: true, id: { notIn: enrolled } },
      select: { id: true, title: true, category: true, thumbnailUrl: true },
      take: 5,
    });

    // Popular content
    const popularContent = await (this.prisma as any).contentAsset.findMany({
      where: { active: true },
      select: { id: true, title: true, type: true },
      orderBy: { viewCount: 'desc' },
      take: 5,
    });

    // Trending search terms (top from history)
    const trending = await safeM(this.prisma, 'searchHistory')
      .groupBy({
        by: ['query'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      })
      .catch(() => [] as any[]);

    return {
      recommendedCourses: suggestedCourses.map(c =>
        normalise(
          SearchEntityType.COURSE,
          c.id,
          c.title,
          c.category ?? '',
          { thumbnailUrl: c.thumbnailUrl },
          `/courses/${c.id}`,
        ),
      ),
      popularContent: popularContent.map(c =>
        normalise(SearchEntityType.CONTENT, c.id, c.title, c.type ?? '', {}, `/content/${c.id}`),
      ),
      trendingSearches: (trending as any[]).map((t: any) => t.query),
    };
  }

  // ══════════════════════════════════════════════════════
  // SEARCH HISTORY
  // ══════════════════════════════════════════════════════

  async getHistory(userId: number, limit = 20) {
    const history = await safeM(this.prisma, 'searchHistory')
      .findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      .catch(() => [] as any[]);

    return { history, count: (history as any[]).length };
  }

  async clearHistory(userId: number) {
    await safeM(this.prisma, 'searchHistory')
      .deleteMany({ where: { userId } })
      .catch(() => null);
    return { message: 'Histórico limpo' };
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════

  async getAnalytics() {
    const [totalSearches, uniqueUsers, topTerms, zeroResults] = await Promise.all([
      safeM(this.prisma, 'searchHistory')
        .count({})
        .catch(() => 0),
      safeM(this.prisma, 'searchHistory')
        .groupBy({ by: ['userId'], _count: { id: true } })
        .then((r: any[]) => r.length)
        .catch(() => 0),
      safeM(this.prisma, 'searchHistory')
        .groupBy({
          by: ['query'],
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        })
        .catch(() => [] as any[]),
      safeM(this.prisma, 'searchHistory')
        .count({ where: { resultsCount: 0 } })
        .catch(() => 0),
    ]);

    return {
      totalSearches,
      uniqueUsers,
      zeroResultsCount: zeroResults,
      topTerms: (topTerms as any[]).map((t: any) => ({ term: t.query, count: t._count.id })),
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // TRACKING (fire-and-forget)
  // ══════════════════════════════════════════════════════

  private async trackSearch(userId: number, query: string, searchType: string, resultsCount = 0) {
    await safeM(this.prisma, 'searchHistory')
      .create({
        data: { userId, query, searchType, resultsCount, createdAt: new Date() },
      })
      .catch(() => {});
  }
}
