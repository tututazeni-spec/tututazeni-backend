import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class KnowledgeService {
  constructor(private prisma: PrismaService) {}

  // Criar artigo
  createArticle(data: Prisma.KnowledgeArticleCreateInput) {
    return this.prisma.knowledgeArticle.create({ data });
  }

  // Listar artigos
  listArticles() {
    return this.prisma.knowledgeArticle.findMany({
      include: { author: true, category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Obter artigo por id
  getArticleById(id: number) {
    return this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: { author: true, category: true, interactions: true },
    });
  }

  // Registrar interação
  createInteraction(data: Prisma.KnowledgeInteractionCreateInput) {
    return this.prisma.knowledgeInteraction.create({ data });
  }

  // Listar categorias
  listCategories() {
    return this.prisma.knowledgeCategory.findMany({
      include: { articles: true },
    });
  }
}