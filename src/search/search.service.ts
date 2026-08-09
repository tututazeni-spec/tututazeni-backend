// src/search/search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma, CompetencyType, ScenarioCategory, Difficulty } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GlobalSearchDto, TypedSearchDto, SearchEntityType } from './search.dto';

// ─── Helpers ─────────────────────────────────────────────────────

const iLike = (q: string) => ({ contains: q, mode: 'insensitive' as const });

// Acesso dinâmico `prisma[name]` a um modelo que pode não existir não tem
// nenhum tipo gerado pelo Prisma para se agarrar — o único cast é o
// `as unknown as DynamicModelDelegate` abaixo, confinado a esta linha; sem
// `any` em lado nenhum.
type DynamicModelDelegate = Record<string, (...args: unknown[]) => Promise<unknown>>;

function safeM(prisma: PrismaService, name: string): DynamicModelDelegate {
  // Stub tinha de cobrir TODOS os métodos realmente chamados contra
  // `searchHistory` (modelo que não existe em prisma/schema.prisma — todo o
  // histórico de pesquisa é, e sempre foi, um no-op silencioso). Faltavam
  // create/deleteMany/groupBy — chamá-los rebentava com "is not a function",
  // um TypeError síncrono que nunca chega a atingir o .catch() encadeado
  // (só intercepta promises rejeitadas, não uma propriedade inexistente).
  return (
    (prisma as unknown as Record<string, DynamicModelDelegate | undefined>)[name] ?? {
      findMany: async () => [],
      count: async () => 0,
      findFirst: async () => null,
      create: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
      groupBy: async () => [],
    }
  );
}

// searchHistory não existe em prisma/schema.prisma — sem tipos gerados pelo
// Prisma. Forma confirmada nos próprios .create() deste ficheiro.
export interface SearchHistoryRow {
  userId: number;
  query: string;
  searchType: string;
  resultsCount: number;
  createdAt: Date;
}

/** Compute a simple relevance score (0–100) based on field match quality */
function relevanceScore(item: Record<string, unknown>, q: string, fields: string[]): number {
  const lq = q.toLowerCase();
  let score = 0;
  for (const f of fields) {
    const val = String(item[f] ?? '').toLowerCase();
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
  extra: Record<string, unknown> = {},
  url?: string,
) {
  return { type, id, title, subtitle: subtitle || '', url: url ?? `/${type}s/${id}`, ...extra };
}

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // GLOBAL SEARCH (multi-entity)
  // ══════════════════════════════════════════════════════

  async globalSearch(q: string, userId: number, dto: Partial<GlobalSearchDto> = {}) {
    if (!q || q.length < 2) return { query: q, results: [], counts: {}, total: 0 };

    const limit = dto.limit ?? 5;
    const types = dto.types ?? Object.values(SearchEntityType);

    // Track search (fire-and-forget)
    this.trackSearch(userId, q, 'global').catch(e =>
      this.logger.warn({
        userId,
        query: q,
        searchType: 'global',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar pesquisa global no histórico',
      }),
    );

    const fetchers: Promise<ReturnType<typeof normalise>[]>[] = [];

    if (types.includes(SearchEntityType.USER))
      fetchers.push(
        this.searchUsers(q, { limit, departmentId: dto.departmentId, activeOnly: dto.activeOnly }),
      );
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.COURSE))
      fetchers.push(
        this.searchCourses(q, { limit, category: dto.category, activeOnly: dto.activeOnly }),
      );
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.DOCUMENT))
      fetchers.push(this.searchDocuments(q, { limit }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.CONTENT))
      fetchers.push(this.searchContent(q, { limit, activeOnly: dto.activeOnly }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.PDI)) fetchers.push(this.searchPdis(q, { limit, userId }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.COMPETENCY))
      fetchers.push(this.searchCompetencies(q, { limit }));
    else fetchers.push(Promise.resolve([]));

    if (types.includes(SearchEntityType.SCENARIO))
      fetchers.push(this.searchScenarios(q, { limit, activeOnly: dto.activeOnly }));
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
    opts: { limit: number; departmentId?: number; activeOnly?: boolean },
  ) {
    const where: Prisma.UserWhereInput = {
      OR: [
        { fullName: iLike(q) },
        { email: iLike(q) },
        { position: { name: iLike(q) } },
        { department: { name: iLike(q) } },
      ],
    };
    // activeOnly era aceite pelo GlobalSearchDto mas nunca lido — `active`
    // estava sempre hardcoded a true, tornando impossível pesquisar
    // colaboradores inactivos mesmo pedindo explicitamente activeOnly=false.
    if (opts.activeOnly !== false) where.active = true;
    if (opts.departmentId) where.departmentId = opts.departmentId;

    const users = await this.prisma.read.user.findMany({
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
    opts: { limit: number; category?: string; activeOnly?: boolean },
  ) {
    const where: Prisma.CourseWhereInput = {
      OR: [{ title: iLike(q) }, { description: iLike(q) }, { category: iLike(q) }],
    };
    // Course não tem coluna `active` — o estado real é `status` (String,
    // convenção DRAFT/PUBLISHED/ARCHIVED usada em todo o módulo courses).
    // Sem catch() nesta query, isto rebentava sempre (500 incondicional) em
    // qualquer pesquisa que envolvesse cursos: global search, /search/courses,
    // autocomplete e /search/suggestions (as três últimas corrigidas abaixo).
    if (opts.activeOnly !== false) where.status = 'PUBLISHED';
    if (opts.category) where.category = opts.category;

    const courses = await this.prisma.course.findMany({
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

  private async searchDocuments(q: string, opts: { limit: number }) {
    // KnowledgeArticle não tem campo `description` (é `summary`) nem `tags`
    // como coluna escalar (é a relação KnowledgeTag[]) — esta query rebentava
    // sempre a nível do Prisma; o .catch() escondia-o silenciosamente,
    // tornando a pesquisa de documentos permanentemente muda (0 resultados,
    // sem erro visível) desde sempre.
    interface ArticleRow {
      id: number;
      title: string;
      summary: string | null;
      category: { name: string } | null;
    }
    const articles: ArticleRow[] = await (
      safeM(this.prisma, 'knowledgeArticle').findMany({
        where: {
          OR: [{ title: iLike(q) }, { summary: iLike(q) }, { tags: { some: { name: iLike(q) } } }],
        },
        select: {
          id: true,
          title: true,
          summary: true,
          category: { select: { name: true } },
        },
        take: opts.limit,
      }) as Promise<ArticleRow[]>
    ).catch(e => {
      this.logger.warn({
        query: q,
        entity: 'knowledgeArticle',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao pesquisar documentos (knowledgeArticle)',
      });
      return [] as ArticleRow[];
    });

    return articles.map(d =>
      normalise(
        SearchEntityType.DOCUMENT,
        d.id,
        d.title,
        d.summary ?? d.category?.name ?? '',
        {},
        `/knowledge/${d.id}`,
      ),
    );
  }

  private async searchContent(q: string, opts: { limit: number; activeOnly?: boolean }) {
    const where: Prisma.ContentAssetWhereInput = {
      OR: [{ title: iLike(q) }, { description: iLike(q) }],
    };
    if (opts.activeOnly !== false) where.active = true;
    const assets = await this.prisma.contentAsset.findMany({
      where,
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

  private async searchPdis(q: string, opts: { limit: number; userId: number }) {
    const plans = await this.prisma.read.developmentPlan.findMany({
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

  private async searchCompetencies(q: string, opts: { limit: number }) {
    const comps = await this.prisma.competency
      .findMany({
        where: { OR: [{ name: iLike(q) }, { description: iLike(q) }] },
        select: { id: true, name: true, type: true, description: true },
        take: opts.limit,
      })
      .catch(e => {
        this.logger.warn({
          query: q,
          entity: 'competency',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao pesquisar competências',
        });
        return [] as {
          id: number;
          name: string;
          type: CompetencyType;
          description: string | null;
        }[];
      });

    return comps.map(c =>
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

  private async searchScenarios(q: string, opts: { limit: number; activeOnly?: boolean }) {
    const where: Prisma.AvatarScenarioWhereInput = {
      OR: [{ title: iLike(q) }, { description: iLike(q) }],
    };
    if (opts.activeOnly !== false) where.active = true;
    const scenarios = await this.prisma.avatarScenario
      .findMany({
        where,
        select: { id: true, title: true, category: true, difficulty: true },
        take: opts.limit,
      })
      .catch(e => {
        this.logger.warn({
          query: q,
          entity: 'avatarScenario',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao pesquisar cenários de avatar',
        });
        return [] as {
          id: number;
          title: string;
          category: ScenarioCategory | null;
          difficulty: Difficulty;
        }[];
      });

    return scenarios.map(s =>
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

    let results: ReturnType<typeof normalise>[] = [];
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

    this.trackSearch(userId, q, type).catch(e =>
      this.logger.warn({
        userId,
        query: q,
        searchType: type,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar pesquisa tipada no histórico',
      }),
    );

    return { query: q, type, results, count: results.length };
  }

  // ══════════════════════════════════════════════════════
  // AUTOCOMPLETE
  // ══════════════════════════════════════════════════════

  async autocomplete(q: string, userId: number, limit = 5) {
    if (q.length < 1) return { suggestions: [] };

    const [users, courses, content] = await Promise.all([
      this.prisma.read.user.findMany({
        where: { fullName: iLike(q), active: true },
        select: { fullName: true },
        take: limit,
      }),
      this.prisma.course.findMany({
        where: { title: iLike(q), status: 'PUBLISHED' },
        select: { title: true },
        take: limit,
      }),
      this.prisma.read.contentAsset.findMany({
        where: { title: iLike(q), active: true },
        select: { title: true },
        take: limit,
      }),
    ]);

    // Recent searches for this user — searchHistory não existe em
    // prisma/schema.prisma (ver safeM acima), por isso sem tipos gerados.
    const recentHistory: { query: string }[] = await (
      safeM(this.prisma, 'searchHistory').findMany({
        where: { userId, query: iLike(q) },
        select: { query: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }) as Promise<{ query: string }[]>
    ).catch(e => {
      this.logger.warn({
        userId,
        query: q,
        entity: 'searchHistory',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter histórico recente para autocomplete',
      });
      return [] as { query: string }[];
    });

    const allSuggestions = [
      ...recentHistory.map(h => ({ text: h.query, type: 'recent' })),
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
    const user = await this.prisma.read.user.findUnique({
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

    const suggestedCourses = await this.prisma.course.findMany({
      where: { status: 'PUBLISHED', id: { notIn: enrolled } },
      select: { id: true, title: true, category: true, thumbnailUrl: true },
      take: 5,
    });

    // Popular content — ContentAsset não tem nenhuma coluna de contagem de
    // vistas (nem `viewCount` nem equivalente); sem catch() nesta query,
    // rebentava sempre (500 incondicional). Sem uma métrica real de
    // popularidade disponível, usa-se recência como proxy em vez de
    // inventar uma coluna que não existe.
    const popularContent = await this.prisma.contentAsset.findMany({
      where: { active: true },
      select: { id: true, title: true, type: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Trending search terms (top from history) — searchHistory não existe
    // em prisma/schema.prisma (ver safeM no topo do ficheiro).
    const trending: { query: string; _count: { id: number } }[] = await (
      safeM(this.prisma, 'searchHistory').groupBy({
        by: ['query'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }) as Promise<{ query: string; _count: { id: number } }[]>
    ).catch(e => {
      this.logger.warn({
        userId,
        entity: 'searchHistory',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter termos de pesquisa em tendência',
      });
      return [] as { query: string; _count: { id: number } }[];
    });

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
      trendingSearches: trending.map(t => t.query),
    };
  }

  // ══════════════════════════════════════════════════════
  // SEARCH HISTORY
  // ══════════════════════════════════════════════════════

  async getHistory(userId: number, limit = 20) {
    const history: SearchHistoryRow[] = await (
      safeM(this.prisma, 'searchHistory').findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }) as Promise<SearchHistoryRow[]>
    ).catch(e => {
      this.logger.warn({
        userId,
        entity: 'searchHistory',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter histórico de pesquisas do utilizador',
      });
      return [] as SearchHistoryRow[];
    });

    return { history, count: history.length };
  }

  async clearHistory(userId: number) {
    await safeM(this.prisma, 'searchHistory')
      .deleteMany({ where: { userId } })
      .catch(e =>
        this.logger.warn({
          userId,
          entity: 'searchHistory',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao limpar histórico de pesquisas do utilizador',
        }),
      );
    return { message: 'Histórico limpo' };
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════

  async getAnalytics() {
    const [totalSearches, uniqueUsers, topTerms, zeroResults] = await Promise.all([
      safeM(this.prisma, 'searchHistory')
        .count({})
        .catch(e => {
          this.logger.warn({
            metric: 'totalSearches',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar total de pesquisas para analytics',
          });
          return 0;
        }),
      safeM(this.prisma, 'searchHistory')
        .groupBy({ by: ['userId'], _count: { id: true } })
        .then((r: { userId: number; _count: { id: number } }[]) => r.length)
        .catch(e => {
          this.logger.warn({
            metric: 'uniqueUsers',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar utilizadores únicos para analytics',
          });
          return 0;
        }),
      (
        safeM(this.prisma, 'searchHistory').groupBy({
          by: ['query'],
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        }) as Promise<{ query: string; _count: { id: number } }[]>
      ).catch(e => {
        this.logger.warn({
          metric: 'topTerms',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter termos mais pesquisados para analytics',
        });
        return [] as { query: string; _count: { id: number } }[];
      }),
      safeM(this.prisma, 'searchHistory')
        .count({ where: { resultsCount: 0 } })
        .catch(e => {
          this.logger.warn({
            metric: 'zeroResults',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar pesquisas sem resultados para analytics',
          });
          return 0;
        }),
    ]);

    return {
      totalSearches,
      uniqueUsers,
      zeroResultsCount: zeroResults,
      topTerms: topTerms.map(t => ({ term: t.query, count: t._count.id })),
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
      .catch(e =>
        this.logger.warn({
          userId,
          query,
          searchType,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao gravar registo de pesquisa no histórico',
        }),
      );
  }
}
