import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  // 🔎 Busca global
  async globalSearch(query: string) {
    return this.prisma.globalSearchIndex.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ➕ Indexar entidade
  async indexEntity(
    entityType: string,
    entityId: number,
    title: string,
    description?: string,
    route?: string,
  ) {
    return this.prisma.globalSearchIndex.create({
      data: {
        entityType,
        entityId,
        title,
        description,
        route,
      },
    });
  }

  // 🗑 Remover do índice
  async removeFromIndex(entityType: string, entityId: number) {
    return this.prisma.globalSearchIndex.deleteMany({
      where: {
        entityType,
        entityId,
      },
    });
  }

  // 📚 Listar índice completo
  async listIndex() {
    return this.prisma.globalSearchIndex.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}