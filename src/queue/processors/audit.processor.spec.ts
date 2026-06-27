import { AuditProcessor } from './audit.processor';

describe('AuditProcessor', () => {
  it('escreve o log de auditoria a partir do job', async () => {
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) } } as any;
    const processor = new AuditProcessor(prisma);
    await processor.handleWrite({ data: { action: 'CREATE', entity: 'User', userId: 1 } } as any);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { action: 'CREATE', entity: 'User', userId: 1 },
    });
  });
});
