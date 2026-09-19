// src/ai-tutor/ai-knowledge.service.ts
// Base de Conhecimento do AI Tutor — RAG "leve" (sem embeddings/vector DB):
// pesquisa por palavras-chave sobre conteúdos já autorizados da plataforma
// (Cursos/Lições, Biblioteca, Documentos internos) e devolve excertos citáveis.
// Ver docs/ai-tutor.md secção 3.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface KnowledgeSource {
  type: 'COURSE' | 'LESSON' | 'LIBRARY' | 'DOCUMENT';
  id: number | string;
  title: string;
  snippet: string;
  label: string;
}

// Categorias de Document consideradas conteúdo institucional partilhável —
// exclui PERSONAL/PAYROLL/HEALTH/CONTRATO/RECRUITMENT/LEAVE/FORMULARIO/OTHER.
const AUTHORIZED_DOC_CATEGORIES = [
  'LEARNING',
  'CORPORATE',
  'COMPLIANCE',
  'POLITICA',
  'MANUAL',
  'PROCEDIMENTO',
  'REGULAMENTO',
  'COMUNICADO',
] as const;

const STOPWORDS = new Set([
  'para',
  'como',
  'onde',
  'quando',
  'porque',
  'sobre',
  'isso',
  'esse',
  'essa',
  'este',
  'esta',
  'qual',
  'quais',
  'tem',
  'tenho',
  'meu',
  'minha',
  'que',
  'com',
  'uma',
  'um',
  'dos',
  'das',
  'não',
  'sim',
]);

@Injectable()
export class AiKnowledgeService {
  constructor(private prisma: PrismaService) {}

  private extractKeywords(text: string, max = 6): string[] {
    const words = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 4 && !STOPWORDS.has(w));
    return [...new Set(words)].slice(0, max);
  }

  private buildSnippet(text: string, keywords: string[], radius = 110): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    const lower = clean.toLowerCase();
    let idx = -1;
    for (const kw of keywords) {
      idx = lower.indexOf(kw);
      if (idx >= 0) break;
    }
    if (idx < 0) {
      return clean.length > radius * 2 ? `${clean.slice(0, radius * 2)}…` : clean;
    }
    const start = Math.max(0, idx - radius);
    const end = Math.min(clean.length, idx + radius);
    return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
  }

  private score(text: string, keywords: string[]): number {
    const lower = text.toLowerCase();
    return keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
  }

  /** Pesquisa conteúdos autorizados relevantes para uma pergunta/tema. */
  async search(query: string, limit = 5): Promise<KnowledgeSource[]> {
    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) return [];

    const orContains = (fields: string[]) =>
      keywords.flatMap(kw =>
        fields.map(field => ({ [field]: { contains: kw, mode: 'insensitive' as const } })),
      );

    const [courses, lessons, libraryItems, documents] = await Promise.all([
      this.prisma.read.course.findMany({
        where: {
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          OR: orContains(['title', 'description']),
        },
        select: { id: true, title: true, description: true },
        take: 15,
      }),
      this.prisma.read.lesson.findMany({
        where: {
          status: 'PUBLISHED',
          module: { course: { status: 'PUBLISHED', visibility: 'PUBLIC' } },
          OR: orContains(['title', 'textContent']),
        },
        select: {
          id: true,
          title: true,
          textContent: true,
          module: { select: { course: { select: { id: true, title: true } } } },
        },
        take: 15,
      }),
      this.prisma.read.libraryItem.findMany({
        where: {
          isApproved: true,
          isPublic: true,
          deletedAt: null,
          OR: orContains(['title', 'description']),
        },
        select: { id: true, title: true, description: true },
        take: 15,
      }),
      this.prisma.read.document.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          sensitivity: { in: ['PUBLIC', 'INTERNAL'] },
          category: { in: [...AUTHORIZED_DOC_CATEGORIES] },
          OR: orContains(['title', 'description', 'ocrText']),
        },
        select: { id: true, title: true, description: true, ocrText: true, category: true },
        take: 15,
      }),
    ]);

    const candidates: (KnowledgeSource & { _score: number })[] = [
      ...courses.map(c => ({
        type: 'COURSE' as const,
        id: c.id,
        title: c.title,
        snippet: this.buildSnippet(c.description ?? c.title, keywords),
        label: `Curso: ${c.title}`,
        _score: this.score(`${c.title} ${c.description ?? ''}`, keywords),
      })),
      ...lessons.map(l => ({
        type: 'LESSON' as const,
        id: l.id,
        title: l.title,
        snippet: this.buildSnippet(l.textContent ?? l.title, keywords),
        label: `Lição: ${l.title} (Curso: ${l.module?.course?.title ?? 'N/A'})`,
        _score: this.score(`${l.title} ${l.textContent ?? ''}`, keywords),
      })),
      ...libraryItems.map(i => ({
        type: 'LIBRARY' as const,
        id: i.id,
        title: i.title,
        snippet: this.buildSnippet(i.description ?? i.title, keywords),
        label: `Biblioteca: ${i.title}`,
        _score: this.score(`${i.title} ${i.description ?? ''}`, keywords),
      })),
      ...documents.map(d => ({
        type: 'DOCUMENT' as const,
        id: d.id,
        title: d.title,
        snippet: this.buildSnippet(d.ocrText ?? d.description ?? d.title, keywords),
        label: `${d.category}: ${d.title}`,
        _score: this.score(`${d.title} ${d.description ?? ''} ${d.ocrText ?? ''}`, keywords),
      })),
    ];

    return candidates
      .filter(c => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score, ...rest }) => rest);
  }

  /** Contagens de conteúdo indexável, por tipo/categoria — para a aba Base de Conhecimento. */
  async getSources() {
    const [courses, lessons, libraryItems, documentsByCategory] = await Promise.all([
      this.prisma.read.course.count({ where: { status: 'PUBLISHED', visibility: 'PUBLIC' } }),
      this.prisma.read.lesson.count({
        where: { status: 'PUBLISHED', textContent: { not: null } },
      }),
      this.prisma.read.libraryItem.count({
        where: { isApproved: true, isPublic: true, deletedAt: null },
      }),
      this.prisma.read.document.groupBy({
        by: ['category'],
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          sensitivity: { in: ['PUBLIC', 'INTERNAL'] },
          category: { in: [...AUTHORIZED_DOC_CATEGORIES] },
        },
        _count: true,
      }),
    ]);

    const documents = documentsByCategory.reduce((sum, d) => sum + d._count, 0);

    return {
      courses,
      lessons,
      libraryItems,
      documents,
      documentsByCategory: documentsByCategory.map(d => ({
        category: d.category,
        count: d._count,
      })),
      total: courses + lessons + libraryItems + documents,
      authorizedDocCategories: AUTHORIZED_DOC_CATEGORIES,
    };
  }
}
