import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../prisma/prisma.service';

const prisma = {
  knowledgeArticle: { findUnique: jest.fn(), update: jest.fn() },
  knowledgeTag: { deleteMany: jest.fn() },
  articleVersion: { create: jest.fn() },
  knowledgeInteraction: { findMany: jest.fn() },
  notificationLog: { create: jest.fn(), createMany: jest.fn() },
};

const existing = { id: 9, authorId: 5, content: 'texto', _count: { versions: 1 } };
const updated = { id: 9, title: 'Novo título', tags: [], category: null };

describe('KnowledgeService.update — notificação dos utilizadores com marcador', () => {
  let service: KnowledgeService;

  beforeEach(async () => {
    jest.resetAllMocks();
    Object.defineProperty(prisma, 'read', { get: () => prisma, configurable: true });
    prisma.knowledgeArticle.findUnique.mockResolvedValue(existing);
    prisma.knowledgeArticle.update.mockResolvedValue(updated);
    prisma.knowledgeInteraction.findMany.mockResolvedValue([]);
    prisma.notificationLog.createMany.mockResolvedValue({ count: 0 });
    const moduleRef = await Test.createTestingModule({
      providers: [KnowledgeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(KnowledgeService);
  });

  const update = () => service.update(9, { title: 'Novo título' } as never, 5, 'RH');

  it('notifica todos os utilizadores com marcador num único createMany', async () => {
    prisma.knowledgeInteraction.findMany.mockResolvedValue([
      { userId: 11 },
      { userId: 12 },
      { userId: 13 },
    ]);

    await update();

    expect(prisma.notificationLog.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    const { data } = prisma.notificationLog.createMany.mock.calls[0][0];
    expect(data.map((n: { userId: number }) => n.userId)).toEqual([11, 12, 13]);
    for (const n of data) {
      expect(n).toMatchObject({
        type: 'KNOWLEDGE_UPDATED',
        message: 'O artigo "Novo título" foi actualizado',
      });
    }
  });

  it('metadata é uma string JSON (NotificationLog.metadata é String?), nunca um objecto', async () => {
    prisma.knowledgeInteraction.findMany.mockResolvedValue([{ userId: 11 }]);

    await update();

    const [row] = prisma.notificationLog.createMany.mock.calls[0][0].data;
    expect(typeof row.metadata).toBe('string');
    expect(JSON.parse(row.metadata)).toEqual({});
  });

  it('procura só marcadores (BOOKMARK) deste artigo, uma vez por utilizador', async () => {
    await update();

    expect(prisma.knowledgeInteraction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articleId: 9, action: 'BOOKMARK' },
        select: { userId: true },
        distinct: ['userId'],
      }),
    );
  });

  it('sem marcadores não escreve nenhuma notificação', async () => {
    await update();

    expect(prisma.notificationLog.createMany).not.toHaveBeenCalled();
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it('se o createMany falhar, a atualização do artigo não falha e o aviso regista os destinatários', async () => {
    prisma.knowledgeInteraction.findMany.mockResolvedValue([{ userId: 11 }, { userId: 12 }]);
    prisma.notificationLog.createMany.mockRejectedValue(new Error('db em baixo'));
    const warn = jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    await expect(update()).resolves.toBe(updated);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'KNOWLEDGE_UPDATED_NOTIFY',
        entityId: 9,
        recipients: 2,
        err: { message: 'db em baixo' },
      }),
    );
  });

  it('uma edição recusada (sem permissão) não notifica ninguém', async () => {
    prisma.knowledgeInteraction.findMany.mockResolvedValue([{ userId: 11 }]);

    await expect(
      service.update(9, { title: 'hack' } as never, 99, 'COLABORADOR'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
    expect(prisma.notificationLog.createMany).not.toHaveBeenCalled();
  });
});
