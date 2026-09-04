// src/micro-learning/micro-learning.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMicroLearningDto,
  UpdateMicroLearningDto,
  MicroLearningFilterDto,
  CreatePlaylistDto,
  DispatchMicroLearningDto,
  MicroLearningUpdateProgressDto,
  MicroLearningSubmitQuizDto,
  InteractDto,
} from './micro-learning.dto';

@Injectable()
export class MicroLearningService {
  private readonly logger = new Logger(MicroLearningService.name);

  constructor(private prisma: PrismaService) {}

  // MicroLearning não tem relações "category"/"likes"/"comments" — categoryId é um
  // escalar sem FK, e "likes" tem de ser contado via a relação real "interactions"
  // filtrada por action='LIKE' (Prisma não filtra _count por sub-condição).
  private async getLikeCountMap(ids: number[]): Promise<Map<number, number>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.read.microLearningInteraction.groupBy({
      by: ['microLearningId'],
      where: { microLearningId: { in: ids }, action: 'LIKE' },
      _count: true,
    });
    return new Map(rows.map(r => [r.microLearningId, r._count]));
  }

  // ─── CATÁLOGO ─────────────────────────────────────────────────────────────

  async findAll(filters: MicroLearningFilterDto) {
    const {
      page = 1,
      limit = 20,
      search,
      contentType,
      level,
      status,
      tag,
      maxDuration,
      sortBy,
    } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.MicroLearningWhereInput = {};
    if (status) where.status = status;
    if (contentType) where.contentType = contentType;
    if (level) where.level = level;
    if (maxDuration) where.durationSeconds = { lte: maxDuration };
    if (tag) where.tags = { has: tag };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    let orderBy: Prisma.MicroLearningOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortBy === 'POPULAR') orderBy = { viewCount: 'desc' };
    if (sortBy === 'DURATION') orderBy = { durationSeconds: 'asc' };

    const [data, total] = await Promise.all([
      // FIX: `(this.prisma as any).microLearning` saltava o accessor `.read`
      // (réplica de leitura) — a leitura ia sempre para o primary.
      this.prisma.read.microLearning.findMany({
        where,
        skip,
        take: limit,
        include: {
          author: { select: { id: true, fullName: true, position: { select: { name: true } } } },
          _count: { select: { progress: true } },
        },
        orderBy,
      }),
      this.prisma.read.microLearning.count({ where }),
    ]);

    const likeCounts = await this.getLikeCountMap(data.map(d => d.id));
    return {
      data: data.map(d => ({ ...d, likeCount: likeCounts.get(d.id) ?? 0 })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number) {
    // FIX: `(this.prisma as any).microLearning` saltava o accessor `.read`.
    const ml = await this.prisma.read.microLearning.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
        quizQuestions: { select: { id: true, question: true, options: true } },
        _count: { select: { progress: true, interactions: true, quizAttempts: true } },
      },
    });
    if (!ml) throw new NotFoundException('Micro-learning não encontrado');

    // Não expor respostas correctas: "options" é um JSON serializado que inclui
    // isCorrect por opção (ver submitQuiz()) — tinha de ser filtrado e nunca foi.
    const quizQuestions = ml.quizQuestions.length
      ? ml.quizQuestions.map(q => ({
          ...q,
          options: (JSON.parse(q.options) as Array<{ text: string }>).map(o => ({
            text: o.text,
          })),
        }))
      : ml.quizQuestions;

    const likeCounts = await this.getLikeCountMap([id]);
    return { ...ml, quizQuestions, likeCount: likeCounts.get(id) ?? 0 };
  }

  async create(dto: CreateMicroLearningDto, authorId?: number) {
    const { quizQuestions, competencyIds, ...data } = dto;

    const ml = await this.prisma.microLearning.create({
      data: {
        title: data.title,
        description: data.description,
        contentType: data.contentType,
        level: data.level,
        status: data.status ?? 'DRAFT',
        durationSeconds: data.durationSeconds,
        mediaUrl: data.mediaUrl,
        textContent: data.textContent,
        thumbnailUrl: data.thumbnailUrl,
        tags: data.tags ?? [],
        categoryId: data.categoryId,
        learningPathId: data.learningPathId,
        xpReward: data.xpReward ?? 10,
        takeaways: data.takeaways ?? [],
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        authorId: authorId ?? null,
        viewCount: 0,
      },
    });

    // Criar questões do quiz
    if (quizQuestions?.length) {
      await this.prisma.microQuizQuestion.createMany({
        data: quizQuestions.map((q, seq) => ({
          microLearningId: ml.id,
          question: q.question,
          options: JSON.stringify(q.options),
          explanation: q.explanation,
          seq,
        })),
      });
    }

    return this.findOne(ml.id);
  }

  async update(id: number, dto: UpdateMicroLearningDto, _updatedById?: number) {
    await this.findOne(id);
    const { quizQuestions, competencyIds, ...data } = dto;

    if (quizQuestions) {
      await this.prisma.microQuizQuestion.deleteMany({ where: { microLearningId: id } });
      if (quizQuestions.length) {
        await this.prisma.microQuizQuestion.createMany({
          data: quizQuestions.map((q, seq) => ({
            microLearningId: id,
            question: q.question,
            options: JSON.stringify(q.options),
            explanation: q.explanation,
            seq,
          })),
        });
      }
    }

    return this.prisma.microLearning.update({
      where: { id },
      data: { ...data, tags: data.tags ?? undefined },
    });
  }

  async publish(id: number) {
    const ml = await this.findOne(id);
    if (ml.status !== 'DRAFT' && ml.status !== 'ARCHIVED') {
      throw new BadRequestException('Apenas DRAFT ou ARCHIVED podem ser publicados');
    }
    return this.prisma.microLearning.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.microLearning.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async remove(id: number) {
    const ml = await this.findOne(id);
    // MicroLearningProgress/Interaction/QuizAttempt não têm onDelete: Cascade —
    // verificar por contagem, não só por status, ou um item ARCHIVED com histórico
    // de utilizadores 500a por violação de FK RESTRICT em vez de dar 403 limpo.
    const counts = ml._count;
    if (
      ml.status === 'PUBLISHED' ||
      counts.progress > 0 ||
      counts.interactions > 0 ||
      counts.quizAttempts > 0
    ) {
      throw new ForbiddenException(
        'Conteúdo publicado ou com histórico de utilizadores não pode ser eliminado. Archive-o primeiro.',
      );
    }
    await this.prisma.microLearning.delete({ where: { id } });
    return { message: 'Micro-learning eliminado' };
  }

  // ─── FEED PERSONALIZADO ───────────────────────────────────────────────────

  async getMyFeed(userId: number, filters: MicroLearningFilterDto) {
    const { page = 1, limit = 20, contentType, level, maxDuration, sortBy } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.MicroLearningWhereInput = { status: 'PUBLISHED' };
    if (contentType) where.contentType = contentType;
    if (level) where.level = level;
    if (maxDuration) where.durationSeconds = { lte: maxDuration };
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    let orderBy: Prisma.MicroLearningOrderByWithRelationInput = { publishedAt: 'desc' };
    if (sortBy === 'POPULAR') orderBy = { viewCount: 'desc' };
    if (sortBy === 'DURATION') orderBy = { durationSeconds: 'asc' };

    const [items, total] = await Promise.all([
      // FIX: mesmo bypass do accessor `.read` de findAll().
      this.prisma.read.microLearning.findMany({
        where,
        skip,
        take: limit,
        include: {
          author: { select: { id: true, fullName: true, position: { select: { name: true } } } },
          _count: { select: { progress: true } },
        },
        orderBy,
      }),
      this.prisma.read.microLearning.count({ where }),
    ]);

    // Enriquecer com progresso e estado do utilizador
    const ids = items.map(i => i.id);
    const userProgressMap = await this.getUserProgressMap(userId, ids);
    const userLikesSet = await this.getUserLikesSet(userId, ids);
    const userSavesSet = await this.getUserSavesSet(userId, ids);
    const likeCounts = await this.getLikeCountMap(ids);

    return {
      data: items.map(item => ({
        ...item,
        likeCount: likeCounts.get(item.id) ?? 0,
        userProgress: userProgressMap.get(item.id) ?? null,
        userLiked: userLikesSet.has(item.id),
        userSaved: userSavesSet.has(item.id),
        isCompleted: (userProgressMap.get(item.id)?.progress ?? 0) >= 100,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async getUserProgressMap(userId: number, ids: number[]) {
    const records = await this.prisma.read.microLearningProgress.findMany({
      where: { userId, microLearningId: { in: ids } },
    });
    return new Map(records.map(r => [r.microLearningId, r]));
  }

  private async getUserLikesSet(userId: number, ids: number[]) {
    const likes = await this.prisma.read.microLearningInteraction.findMany({
      where: { userId, microLearningId: { in: ids }, action: 'LIKE' },
      select: { microLearningId: true },
    });
    return new Set(likes.map(l => l.microLearningId));
  }

  private async getUserSavesSet(userId: number, ids: number[]) {
    const saves = await this.prisma.read.microLearningInteraction.findMany({
      where: { userId, microLearningId: { in: ids }, action: 'SAVE' },
      select: { microLearningId: true },
    });
    return new Set(saves.map(s => s.microLearningId));
  }

  // ─── PROGRESSO ────────────────────────────────────────────────────────────

  async updateProgress(userId: number, dto: MicroLearningUpdateProgressDto) {
    const ml = await this.findOne(dto.microLearningId);

    const existing = await this.prisma.microLearningProgress.findFirst({
      where: { userId, microLearningId: dto.microLearningId },
    });

    const isCompleting = dto.progress >= 100 && (!existing || existing.progress < 100);

    const record = await this.prisma.microLearningProgress.upsert({
      where: { userId_microLearningId: { userId, microLearningId: dto.microLearningId } },
      create: {
        userId,
        microLearningId: dto.microLearningId,
        progress: dto.progress,
        watchedSeconds: dto.watchedSeconds ?? 0,
        completedAt: dto.progress >= 100 ? new Date() : null,
      },
      update: {
        progress: Math.max(existing?.progress ?? 0, dto.progress),
        watchedSeconds: dto.watchedSeconds ?? undefined,
        completedAt: isCompleting ? new Date() : undefined,
      },
    });

    // Incrementar contador de views
    if (!existing) {
      await this.prisma.microLearning.update({
        where: { id: dto.microLearningId },
        data: { viewCount: { increment: 1 } },
      });
    }

    // XP e streak ao completar
    if (isCompleting) {
      const xp = ml.xpReward ?? 10;
      await this.prisma.userPoints
        .upsert({
          where: { userId },
          create: { userId, points: xp },
          update: { points: { increment: xp } },
        })
        .catch(e =>
          this.logger.warn({
            userId,
            microLearningId: dto.microLearningId,
            action: 'MICROLEARNING_XP',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao atribuir XP por conclusão de micro-learning',
          }),
        );

      await this.updateStreak(userId);

      await this.prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'MICROLEARNING_COMPLETED',
            message: `✅ Concluíste "${ml.title}" e ganháste ${xp} XP`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(e =>
          this.logger.warn({
            userId,
            microLearningId: dto.microLearningId,
            action: 'MICROLEARNING_COMPLETED',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao notificar conclusão de micro-learning',
          }),
        );
    }

    return record;
  }

  private async updateStreak(userId: number) {
    const streak = await this.prisma.read.learningStreak.findUnique({ where: { userId } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!streak) {
      await this.prisma.learningStreak.create({
        data: { userId, currentStreak: 1, longestStreak: 1, lastActivityDate: today },
      });
      return;
    }

    const last = new Date(streak.lastActivityDate);
    last.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return; // Já contou hoje

    const newStreak = diffDays === 1 ? streak.currentStreak + 1 : 1; // Streak quebrou

    await this.prisma.learningStreak.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, streak.longestStreak),
        lastActivityDate: today,
      },
    });
  }

  // ─── QUIZ ─────────────────────────────────────────────────────────────────

  async submitQuiz(userId: number, dto: MicroLearningSubmitQuizDto) {
    const questions = await this.prisma.read.microQuizQuestion.findMany({
      where: { microLearningId: dto.microLearningId },
      orderBy: { seq: 'asc' },
    });

    if (!questions.length) throw new BadRequestException('Este conteúdo não tem quiz');

    let correct = 0;
    const results = questions.map((q, idx) => {
      const opts = JSON.parse(q.options) as Array<{ isCorrect?: boolean }>;
      const correctIdx = opts.findIndex(o => o.isCorrect);
      const isCorrect = dto.answers[idx] === correctIdx;
      if (isCorrect) correct++;
      return {
        question: q.question,
        selected: dto.answers[idx],
        correctIndex: correctIdx,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const score = Math.round((correct / questions.length) * 100);

    await this.prisma.microQuizAttempt.create({
      data: {
        userId,
        microLearningId: dto.microLearningId,
        score,
        answers: JSON.stringify(dto.answers),
        completedAt: new Date(),
      },
    });

    return { score, correct, total: questions.length, results };
  }

  // ─── INTERAÇÕES ───────────────────────────────────────────────────────────

  async interact(userId: number, dto: InteractDto) {
    if (dto.action === 'LIKE' || dto.action === 'SAVE') {
      const existing = await this.prisma.microLearningInteraction.findFirst({
        where: { userId, microLearningId: dto.microLearningId, action: dto.action },
      });
      if (existing) {
        await this.prisma.microLearningInteraction.delete({ where: { id: existing.id } });
        return { action: dto.action, active: false };
      }
    }

    await this.prisma.microLearningInteraction.create({
      data: { userId, microLearningId: dto.microLearningId, action: dto.action },
    });

    return { action: dto.action, active: true };
  }

  async getMySaved(userId: number) {
    const saves = await this.prisma.read.microLearningInteraction.findMany({
      where: { userId, action: 'SAVE' },
      include: {
        microLearning: {
          include: {
            author: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const items = saves.map(s => s.microLearning);
    const likeCounts = await this.getLikeCountMap(items.map(i => i.id));
    return items.map(i => ({ ...i, likeCount: likeCounts.get(i.id) ?? 0 }));
  }

  // ─── PLAYLISTS ────────────────────────────────────────────────────────────

  async createPlaylist(dto: CreatePlaylistDto, authorId: number) {
    const { contentIds, ...data } = dto;

    const playlist = await this.prisma.microLearningPlaylist.create({
      data: { ...data, authorId },
    });

    if (contentIds?.length) {
      await this.prisma.playlistItem.createMany({
        data: contentIds.map((mlId, seq) => ({
          playlistId: playlist.id,
          microLearningId: mlId,
          seq,
        })),
      });
    }

    return this.getPlaylist(playlist.id);
  }

  async getPlaylist(id: number) {
    const pl = await this.prisma.read.microLearningPlaylist.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            microLearning: {
              select: {
                id: true,
                title: true,
                contentType: true,
                durationSeconds: true,
                thumbnailUrl: true,
                level: true,
              },
            },
          },
          orderBy: { seq: 'asc' },
        },
        author: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
      },
    });
    if (!pl) throw new NotFoundException('Playlist não encontrada');
    return pl;
  }

  async getPlaylists() {
    return this.prisma.read.microLearningPlaylist.findMany({
      include: {
        author: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── DISPATCH ─────────────────────────────────────────────────────────────

  async dispatch(dto: DispatchMicroLearningDto) {
    await this.findOne(dto.microLearningId);

    // Criar apenas para quem ainda não recebeu
    const existing = await this.prisma.read.microLearningProgress.findMany({
      where: { microLearningId: dto.microLearningId, userId: { in: dto.userIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map(e => e.userId));
    const newIds = dto.userIds.filter(id => !existingIds.has(id));

    if (newIds.length) {
      await this.prisma.microLearningProgress.createMany({
        data: newIds.map(userId => ({
          userId,
          microLearningId: dto.microLearningId,
          progress: 0,
          watchedSeconds: 0,
        })),
      });

      // Notificar
      for (const userId of newIds.slice(0, 100)) {
        await this.prisma.notificationLog
          .create({
            data: {
              userId,
              type: 'MICROLEARNING_DISPATCHED',
              message: `📚 Novo conteúdo de micro-learning disponível para si`,
              metadata: JSON.stringify({}),
            },
          })
          .catch(e =>
            this.logger.warn({
              userId,
              microLearningId: dto.microLearningId,
              action: 'MICROLEARNING_DISPATCHED',
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao notificar dispatch de micro-learning',
            }),
          );
      }
    }

    return { dispatched: newIds.length, skipped: existingIds.size, total: dto.userIds.length };
  }

  async dispatchToAll(microLearningId: number) {
    await this.findOne(microLearningId);
    const users = await this.prisma.read.user.findMany({
      where: { active: true },
      select: { id: true },
    });
    return this.dispatch({ microLearningId, userIds: users.map(u => u.id) });
  }

  // ─── STREAK & DASHBOARD DO UTILIZADOR ────────────────────────────────────

  async getMyDashboard(userId: number) {
    const [streak, totalCompleted, totalMinutes, recentActivity, quizAttempts] = await Promise.all([
      this.prisma.read.learningStreak.findUnique({ where: { userId } }),
      this.prisma.read.microLearningProgress.count({ where: { userId, progress: { gte: 100 } } }),
      this.prisma.read.microLearningProgress.aggregate({
        where: { userId },
        _sum: { watchedSeconds: true },
      }),
      this.prisma.read.microLearningProgress.findMany({
        where: { userId, progress: { gt: 0 } },
        include: {
          microLearning: {
            select: { id: true, title: true, contentType: true, thumbnailUrl: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.read.microQuizAttempt.aggregate({
        where: { userId },
        _avg: { score: true },
        _count: true,
      }),
    ]);

    const userPoints = await this.prisma.read.userPoints.findUnique({ where: { userId } });

    return {
      streak: {
        current: streak?.currentStreak ?? 0,
        longest: streak?.longestStreak ?? 0,
        lastActivity: streak?.lastActivityDate ?? null,
      },
      stats: {
        completed: totalCompleted,
        totalMinutes: Math.round((totalMinutes._sum.watchedSeconds ?? 0) / 60),
        totalXp: userPoints?.points ?? 0,
        avgQuizScore: Math.round(quizAttempts._avg.score ?? 0),
        quizCount: quizAttempts._count,
      },
      recentActivity,
    };
  }

  // ─── ANALYTICS ────────────────────────────────────────────────────────────

  async getContentStats(id: number) {
    await this.findOne(id);

    const [totalViews, completions, avgProgress, quizStats, likeCount] = await Promise.all([
      this.prisma.read.microLearningProgress.count({ where: { microLearningId: id } }),
      this.prisma.read.microLearningProgress.count({
        where: { microLearningId: id, progress: { gte: 100 } },
      }),
      this.prisma.read.microLearningProgress.aggregate({
        where: { microLearningId: id },
        _avg: { progress: true, watchedSeconds: true },
      }),
      this.prisma.read.microQuizAttempt.aggregate({
        where: { microLearningId: id },
        _avg: { score: true },
        _count: true,
      }),
      this.prisma.read.microLearningInteraction.count({
        where: { microLearningId: id, action: 'LIKE' },
      }),
    ]);

    const completionRate = totalViews > 0 ? Math.round((completions / totalViews) * 100) : 0;

    return {
      microLearningId: id,
      views: totalViews,
      completions,
      completionRate,
      avgProgress: Math.round(avgProgress._avg.progress ?? 0),
      avgWatchSeconds: Math.round(avgProgress._avg.watchedSeconds ?? 0),
      likes: likeCount,
      quiz: {
        attempts: quizStats._count,
        avgScore: Math.round(quizStats._avg.score ?? 0),
      },
    };
  }

  async getAdminDashboard() {
    const [total, published, totalViews, topContent, activeStreaks] = await Promise.all([
      this.prisma.read.microLearning.count(),
      this.prisma.read.microLearning.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.read.microLearning.aggregate({ _sum: { viewCount: true } }),
      // FIX: mesmo bypass do accessor `.read` de findAll()/getMyFeed().
      this.prisma.read.microLearning.findMany({
        where: { status: 'PUBLISHED' },
        include: { author: { select: { fullName: true } } },
        orderBy: { viewCount: 'desc' },
        take: 5,
      }),
      this.prisma.read.learningStreak.count({ where: { currentStreak: { gt: 0 } } }),
    ]);

    const avgCompletionRate = await this.prisma.read.microLearningProgress.aggregate({
      _avg: { progress: true },
    });
    const likeCounts = await this.getLikeCountMap(topContent.map(c => c.id));

    return {
      content: { total, published },
      views: totalViews._sum.viewCount ?? 0,
      avgCompletionRate: Math.round(avgCompletionRate._avg.progress ?? 0),
      activeStreaks,
      topContent: topContent.map(c => ({ ...c, likeCount: likeCounts.get(c.id) ?? 0 })),
    };
  }
}
