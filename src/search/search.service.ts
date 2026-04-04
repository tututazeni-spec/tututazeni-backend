// src/search/search.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// NOTE: Schema corrections applied:
// - Position has no 'title' field → using 'name'
// - Course has no 'thumbnail' field → removed
// - companyDocument model does not exist → replaced with KnowledgeArticle
// - contentItem model does not exist → replaced with ContentAsset

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async globalSearch(q: string, _userId: number) {
    if (!q || q.length < 2) return { results: [] };
    const term = { contains: q, mode: 'insensitive' as const };

    const [users, courses, articles, assets] = await Promise.all([
      this.prisma.user.findMany({
        where: { OR: [{ fullName: term }, { email: term }], active: true },
        // Position has 'name', not 'title'
        select: { id: true, fullName: true, email: true, position: { select: { name: true } } },
        take: 5,
      }),
      this.prisma.course.findMany({
        where: { OR: [{ title: term }, { description: term }], active: true },
        // Course has no 'thumbnail' field
        select: { id: true, title: true, category: true },
        take: 5,
      }),
      // companyDocument → KnowledgeArticle (has title, description)
      this.prisma.knowledgeArticle.findMany({
        where: { OR: [{ title: term }, { description: term }] },
        select: { id: true, title: true, description: true },
        take: 5,
      }),
      // contentItem → ContentAsset (has title, description, type)
      this.prisma.contentAsset.findMany({
        where: { OR: [{ title: term }, { description: term }], active: true },
        select: { id: true, title: true, type: true },
        take: 5,
      }),
    ]);

    return {
      query: q,
      results: [
        ...users.map((u: typeof users[number]) => ({
          type: 'user',
          id: u.id,
          title: u.fullName,
          subtitle: u.position?.name ?? '',
          url: `/users/${u.id}`,
        })),
        ...courses.map((c: typeof courses[number]) => ({
          type: 'course',
          id: c.id,
          title: c.title,
          subtitle: c.category ?? '',
          url: `/courses/${c.id}`,
        })),
        ...articles.map((d: typeof articles[number]) => ({
          type: 'document',
          id: d.id,
          title: d.title,
          subtitle: d.description ?? '',
          url: `/knowledge/${d.id}`,
        })),
        ...assets.map((c: typeof assets[number]) => ({
          type: 'content',
          id: c.id,
          title: c.title,
          subtitle: c.type ?? '',
          url: `/content/${c.id}`,
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