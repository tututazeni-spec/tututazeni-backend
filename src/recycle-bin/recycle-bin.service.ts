// src/recycle-bin/recycle-bin.service.ts
// Reciclagem da Biblioteca: conteúdos (ContentAsset) e documentos corporativos
// (Document) apagados pelo admin ficam aqui 30 dias, restauráveis. Passado o prazo
// a rotina diária apaga-os de vez.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DocStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const RECYCLE_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecycleKind = 'CONTENT' | 'DOCUMENT';

export interface RecycleEntry {
  kind: RecycleKind;
  id: number;
  title: string;
  format: string | null;
  deletedAt: Date;
  purgeAt: Date;
  daysLeft: number;
}

function toEntry(
  kind: RecycleKind,
  r: { id: number; title: string; deletedAt: Date | null },
  format: string | null,
  now: Date,
): RecycleEntry {
  const deletedAt = r.deletedAt as Date;
  const purgeAt = new Date(deletedAt.getTime() + RECYCLE_RETENTION_DAYS * DAY_MS);
  return {
    kind,
    id: r.id,
    title: r.title,
    format,
    deletedAt,
    purgeAt,
    daysLeft: Math.max(0, Math.ceil((purgeAt.getTime() - now.getTime()) / DAY_MS)),
  };
}

@Injectable()
export class RecycleBinService {
  private readonly logger = new Logger(RecycleBinService.name);

  constructor(private readonly prisma: PrismaService) {}

  private cutoff(now = new Date()) {
    return new Date(now.getTime() - RECYCLE_RETENTION_DAYS * DAY_MS);
  }

  async list(now = new Date()): Promise<RecycleEntry[]> {
    const since = this.cutoff(now);
    const [contents, docs] = await Promise.all([
      this.prisma.contentAsset.findMany({
        where: { deletedAt: { gte: since } },
        select: { id: true, title: true, type: true, deletedAt: true },
      }),
      this.prisma.document.findMany({
        where: { deletedAt: { gte: since } },
        select: { id: true, title: true, mimeType: true, deletedAt: true },
      }),
    ]);
    return [
      ...contents.map(c => toEntry('CONTENT', c, c.type, now)),
      ...docs.map(d => toEntry('DOCUMENT', d, d.mimeType ?? null, now)),
    ].sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  }

  async restore(kind: RecycleKind, id: number) {
    const since = this.cutoff();
    if (kind === 'CONTENT') {
      const r = await this.prisma.contentAsset.updateMany({
        where: { id, deletedAt: { gte: since } },
        data: { deletedAt: null, deletedById: null, active: true },
      });
      if (r.count === 0) throw new NotFoundException('Item não encontrado na reciclagem');
    } else {
      const r = await this.prisma.document.updateMany({
        where: { id, deletedAt: { gte: since } },
        data: { deletedAt: null, deleteReason: null, status: DocStatus.ACTIVE },
      });
      if (r.count === 0) throw new NotFoundException('Item não encontrado na reciclagem');
    }
    return { message: 'Item restaurado' };
  }

  /** Apaga de vez o que está na reciclagem há mais de 30 dias. Falhas por item não param a rotina. */
  async purgeExpired(now = new Date()) {
    const before = this.cutoff(now);
    let purged = 0;
    const contents = await this.prisma.contentAsset.findMany({
      where: { deletedAt: { lt: before } },
      select: { id: true },
    });
    const docs = await this.prisma.document.findMany({
      where: { deletedAt: { lt: before } },
      select: { id: true },
    });
    for (const { id } of contents) {
      try {
        await this.prisma.contentAsset.delete({ where: { id } });
        purged++;
      } catch (e) {
        this.logger.warn({
          id,
          kind: 'CONTENT',
          err: String(e),
          msg: 'Não foi possível apagar de vez',
        });
      }
    }
    for (const { id } of docs) {
      try {
        await this.prisma.document.delete({ where: { id } });
        purged++;
      } catch (e) {
        this.logger.warn({
          id,
          kind: 'DOCUMENT',
          err: String(e),
          msg: 'Não foi possível apagar de vez',
        });
      }
    }
    return { purged };
  }

  @Cron('0 4 * * *')
  async nightlyPurge() {
    try {
      const r = await this.purgeExpired();
      if (r.purged > 0) this.logger.log({ ...r, msg: 'Reciclagem: itens expirados apagados' });
    } catch (e) {
      this.logger.error({ err: String(e), msg: 'Reciclagem: falha na limpeza diária' });
    }
  }
}
