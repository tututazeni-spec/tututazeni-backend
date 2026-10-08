import { AuditProcessor } from './audit.processor';

describe('AuditProcessor', () => {
  it('escreve o log de auditoria a partir do job, como novo elo da cadeia de hash', async () => {
    const prisma: any = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findFirst: jest.fn().mockResolvedValue({ hash: 'prev' }),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const processor = new AuditProcessor(prisma);
    await processor.handleWrite({ data: { action: 'CREATE', entity: 'User', userId: 1 } } as any);
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entity: 'User',
        userId: 1,
        previousHash: 'prev',
        hash: expect.any(String),
      }),
    });
  });

  it('propaga a falha para o Bull repetir o job', async () => {
    const prisma: any = { $transaction: jest.fn().mockRejectedValue(new Error('db down')) };
    await expect(
      new AuditProcessor(prisma).handleWrite({
        data: { action: 'X', entity: 'Y', userId: 1 },
      } as any),
    ).rejects.toThrow('db down');
  });
});
