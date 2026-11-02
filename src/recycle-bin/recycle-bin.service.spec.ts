import { NotFoundException } from '@nestjs/common';
import { RecycleBinService, RECYCLE_RETENTION_DAYS } from './recycle-bin.service';

const DAY = 24 * 60 * 60 * 1000;

function build() {
  const prisma = {
    contentAsset: { findMany: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
    document: { findMany: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  };
  return { prisma, svc: new RecycleBinService(prisma as never) };
}

describe('RecycleBinService', () => {
  const now = new Date('2026-11-02T12:00:00Z');

  it('lista só o que foi apagado nos últimos 30 dias, com os dias que restam', async () => {
    const { prisma, svc } = build();
    prisma.contentAsset.findMany.mockResolvedValue([
      { id: 1, title: 'Curso A', type: 'PDF', deletedAt: new Date(now.getTime() - 10 * DAY) },
    ]);
    prisma.document.findMany.mockResolvedValue([
      { id: 2, title: 'Política', mimeType: 'application/pdf', deletedAt: new Date(now.getTime() - 1 * DAY) },
    ]);
    const out = await svc.list(now);
    const since = prisma.contentAsset.findMany.mock.calls[0][0].where.deletedAt.gte as Date;
    expect(since.getTime()).toBe(now.getTime() - RECYCLE_RETENTION_DAYS * DAY);
    expect(out.map(e => [e.kind, e.id, e.daysLeft])).toEqual([
      ['DOCUMENT', 2, 29],
      ['CONTENT', 1, 20],
    ]);
  });

  it('restaura um conteúdo e volta a activá-lo', async () => {
    const { prisma, svc } = build();
    prisma.contentAsset.updateMany.mockResolvedValue({ count: 1 });
    await svc.restore('CONTENT', 5);
    expect(prisma.contentAsset.updateMany.mock.calls[0][0].data).toEqual({
      deletedAt: null,
      deletedById: null,
      active: true,
    });
  });

  it('restaurar um item fora da reciclagem dá 404', async () => {
    const { prisma, svc } = build();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.restore('DOCUMENT', 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a limpeza apaga o que passou dos 30 dias e não pára numa falha', async () => {
    const { prisma, svc } = build();
    prisma.contentAsset.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.document.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.contentAsset.delete.mockRejectedValueOnce(new Error('FK')).mockResolvedValue({});
    prisma.document.delete.mockResolvedValue({});
    const r = await svc.purgeExpired(now);
    expect(r.purged).toBe(2);
    const lt = prisma.contentAsset.findMany.mock.calls[0][0].where.deletedAt.lt as Date;
    expect(lt.getTime()).toBe(now.getTime() - 30 * DAY);
  });
});
