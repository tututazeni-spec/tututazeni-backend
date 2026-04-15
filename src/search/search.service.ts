import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async globalSearch(q: string, _userId: number) {
    if (!q || q.length < 2) return { results: [] };
    const term = { contains: q, mode: 'insensitive' as const };

    const [users, courses, articles, assets] = await Promise.all([
      this.prisma.user.findMany({
        where:  { OR: [{ fullName: term }, { email: term }], active: true },
        select: { id: true, fullName: true, email: true, position: { select: { name: true } } },
        take:   5,
      }),
      this.prisma.course.findMany({
        where:  { OR: [{ title: term }, { description: term }], status: 'ACTIVE' },
        select: { id: true, title: true, category: true },
        take:   5,
      }),
      this.prisma.knowledgeArticle.findMany({
        where:  { OR: [{ title: term }, { summary: term }] },
        select: { id: true, title: true, summary: true },
        take:   5,
      }),
      // ← corrigido: removido status: 'ACTIVE' — campo não existe em ContentAssetWhereInput
      this.prisma.contentAsset.findMany({
        where:  { OR: [{ title: term }] },
        select: { id: true, title: true, type: true },
        take:   5,
      }),
    ]);

    return {
      query:   q,
      results: [
        ...users.map((u: typeof users[number]) => ({
          type:     'user',
          id:       u.id,
          title:    u.fullName,
          subtitle: u.position?.name ?? '',
          url:      `/users/${u.id}`,
        })),
        ...courses.map((c: typeof courses[number]) => ({
          type:     'course',
          id:       c.id,
          title:    c.title,
          subtitle: c.category ?? '',
          url:      `/courses/${c.id}`,
        })),
        ...articles.map((d: typeof articles[number]) => ({
          type:     'document',
          id:       d.id,
          title:    d.title,
          subtitle: d.summary ?? '',
          url:      `/knowledge/${d.id}`,
        })),
        ...assets.map((c: typeof assets[number]) => ({
          type:     'content',
          id:       c.id,
          title:    c.title,
          subtitle: c.type ?? '',
          url:      `/content/${c.id}`,
        })),
      ],
      counts: {
        users:     users.length,
        courses:   courses.length,
        documents: articles.length,
        content:   assets.length,
      },
    };
  }
}