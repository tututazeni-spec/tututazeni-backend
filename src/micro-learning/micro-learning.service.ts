// src/micro-learning/micro-learning.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMicroLearningDto,
  UpdateMicroLearningDto,
  MicroLearningFilterDto,
  CreatePlaylistDto,
  DispatchMicroLearningDto,
  UpdateProgressDto,
  SubmitQuizDto,
  InteractDto,
} from './micro-learning.dto';

@Injectable()
export class MicroLearningService {
  private readonly logger = new Logger(MicroLearningService.name);

  constructor(private prisma: PrismaService) {}

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

    const where: any = {};
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

    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'POPULAR') orderBy = { viewCount: 'desc' };
    if (sortBy === 'DURATION') orderBy = { durationSeconds: 'asc' };

    const [data, total] = await Promise.all([
      (this.prisma as any).microLearning.findMany({
        where,
        skip,
        take: limit,
        include: {
          author: { select: { id: true, fullName: true, position: { select: { name: true } } } },
          category: { select: { id: true, name: true } },
          _count: { select: { progress: true, likes: true } },
        },
        orderBy,
      }),
      this.prisma.microLearning.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const ml = await (this.prisma as any).microLearning.findUnique({
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
        category: { select: { id: true, name: true } },
        quizQuestions: { select: { id: true, question: true, options: true } }, // não expõe respostas correctas
        _count: { select: { progress: true, likes: true, comments: true } },
      },
    });
    if (!ml) throw new NotFoundException('Micro-learning não encontrado');
    return ml;
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

  async update(id: number, dto: UpdateMicroLearningDto, updatedById?: number) {
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
    if (ml.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Conteúdo publicado não pode ser eliminado. Archive-o primeiro.',
      );
    }
    await this.prisma.microLearning.delete({ where: { id } });
    return { message: 'Micro-learning eliminado' };
  }

  // ─── FEED PERSONALIZADO ───────────────────────────────────────────────────

  async getMyFeed(userId: number, filters: MicroLearningFilterDto) {
    const { page = 1, limit = 20, contentType, level, maxDuration, sortBy } = filters;
    const skip = (page - 1) * limit;

    const where: any = { status: 'PUBLISHED' };
    if (contentType) where.contentType = contentType;
    if (level) where.level = level;
    if (maxDuration) where.durationSeconds = { lte: maxDuration };
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = { publishedAt: 'desc' };
    if (sortBy === 'POPULAR') orderBy = { viewCount: 'desc' };
    if (sortBy === 'DURATION') orderBy = { durationSeconds: 'asc' };

    const [items, total] = await Promise.all([
      (this.prisma as any).microLearning.findMany({
        where,
        skip,
        take: limit,
        include: {
          author: { select: { id: true, fullName: true, position: { select: { name: true } } } },
          category: { select: { id: true, name: true } },
          _count: { select: { progress: true, likes: true } },
        },
        orderBy,
      }),
      this.prisma.microLearning.count({ where }),
    ]);

    // Enriquecer com progresso e estado do utilizador
    const userProgressMap = await this.getUserProgressMap(
      userId,
      items.map(i => i.id),
    );
    const userLikesSet = await this.getUserLikesSet(
      userId,
      items.map(i => i.id),
    );
    const userSavesSet = await this.getUserSavesSet(
      userId,
      items.map(i => i.id),
    );

    return {
      data: items.map(item => ({
        ...item,
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
    const records = await this.prisma.microLearningProgress.findMany({
      where: { userId, microLearningId: { in: ids } },
    });
    return new Map(records.map(r => [r.microLearningId, r]));
  }

  private async getUserLikesSet(userId: number, ids: number[]) {
    const likes = await this.prisma.microLearningInteraction.findMany({
      where: { userId, microLearningId: { in: ids }, action: 'LIKE' },
      select: { microLearningId: true },
    });
    return new Set(likes.map(l => l.microLearningId));
  }

  private async getUserSavesSet(userId: number, ids: number[]) {
    const saves = await (this.prisma as any).microLearningInteraction.findMany({
      where: { userId, microLearningId: { in: ids }, action: 'SAVE' },
      select: { microLearningId: true },
    });
    return new Set(saves.map(s => s.microLearningId));
  }

  // ─── PROGRESSO ────────────────────────────────────────────────────────────

  async updateProgress(userId: number, dto: UpdateProgressDto) {
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
        .catch(() => {});

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
        .catch(() => {});
    }

    return record;
  }

  private async updateStreak(userId: number) {
    const streak = await this.prisma.learningStreak.findUnique({ where: { userId } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!streak) {
      await this.prisma.learningStreak.create({
        data: { userId, currentStreak: 1, longestStreak: 1, lastActivityDate: today },
      });
      return;
    }

    const last = new Date((streak as any).lastActivityDate);
    last.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return; // Já contou hoje

    const newStreak = diffDays === 1 ? (streak as any).currentStreak + 1 : 1; // Streak quebrou

    await this.prisma.learningStreak.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, (streak as any).longestStreak),
        lastActivityDate: today,
      },
    });
  }

  // ─── QUIZ ─────────────────────────────────────────────────────────────────

  async submitQuiz(userId: number, dto: SubmitQuizDto) {
    const questions = await this.prisma.microQuizQuestion.findMany({
      where: { microLearningId: dto.microLearningId },
      orderBy: { seq: 'asc' },
    });

    if (!questions.length) throw new BadRequestException('Este conteúdo não tem quiz');

    let correct = 0;
    const results = questions.map((q, idx) => {
      const opts = JSON.parse(q.options as any);
      const correctIdx = opts.findIndex((o: any) => o.isCorrect);
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
    const saves = await (this.prisma as any).microLearningInteraction.findMany({
      where: { userId, action: 'SAVE' },
      include: {
        microLearning: {
          include: {
            author: { select: { id: true, fullName: true } },
            category: { select: { id: true, name: true } },
            _count: { select: { likes: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return saves.map(s => s.microLearning);
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
    const pl = await (this.prisma as any).microLearningPlaylist.findUnique({
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
    return this.prisma.microLearningPlaylist.findMany({
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
    const existing = await this.prisma.microLearningProgress.findMany({
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
          .catch(() => {});
      }
    }

    return { dispatched: newIds.length, skipped: existingIds.size, total: dto.userIds.length };
  }

  async dispatchToAll(microLearningId: number) {
    await this.findOne(microLearningId);
    const users = await this.prisma.user.findMany({
      where: { active: true },
      select: { id: true },
    });
    return this.dispatch({ microLearningId, userIds: users.map(u => u.id) });
  }

  // ─── STREAK & DASHBOARD DO UTILIZADOR ────────────────────────────────────

  async getMyDashboard(userId: number) {
    const [streak, totalCompleted, totalMinutes, recentActivity, quizAttempts] = await Promise.all([
      this.prisma.learningStreak.findUnique({ where: { userId } }),
      this.prisma.microLearningProgress.count({ where: { userId, progress: { gte: 100 } } }),
      this.prisma.microLearningProgress.aggregate({
        where: { userId },
        _sum: { watchedSeconds: true },
      }),
      this.prisma.microLearningProgress.findMany({
        where: { userId, progress: { gt: 0 } },
        include: {
          microLearning: {
            select: { id: true, title: true, contentType: true, thumbnailUrl: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.microQuizAttempt.aggregate({
        where: { userId },
        _avg: { score: true },
        _count: true,
      }),
    ]);

    const userPoints = await this.prisma.userPoints.findUnique({ where: { userId } });

    return {
      streak: {
        current: (streak as any)?.currentStreak ?? 0,
        longest: (streak as any)?.longestStreak ?? 0,
        lastActivity: (streak as any)?.lastActivityDate ?? null,
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
      this.prisma.microLearningProgress.count({ where: { microLearningId: id } }),
      this.prisma.microLearningProgress.count({
        where: { microLearningId: id, progress: { gte: 100 } },
      }),
      this.prisma.microLearningProgress.aggregate({
        where: { microLearningId: id },
        _avg: { progress: true, watchedSeconds: true },
      }),
      this.prisma.microQuizAttempt.aggregate({
        where: { microLearningId: id },
        _avg: { score: true },
        _count: true,
      }),
      this.prisma.microLearningInteraction.count({
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
      this.prisma.microLearning.count(),
      this.prisma.microLearning.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.microLearning.aggregate({ _sum: { viewCount: true } }),
      (this.prisma as any).microLearning.findMany({
        where: { status: 'PUBLISHED' },
        include: { author: { select: { fullName: true } }, _count: { select: { likes: true } } },
        orderBy: { viewCount: 'desc' },
        take: 5,
      }),
      this.prisma.learningStreak.count({ where: { currentStreak: { gt: 0 } } }),
    ]);

    const avgCompletionRate = await this.prisma.microLearningProgress.aggregate({
      _avg: { progress: true },
    });

    return {
      content: { total, published },
      views: totalViews._sum.viewCount ?? 0,
      avgCompletionRate: Math.round(avgCompletionRate._avg.progress ?? 0),
      activeStreaks,
      topContent,
    };
  }
}
