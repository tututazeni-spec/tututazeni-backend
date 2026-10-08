import { writeChainedAuditLog, GENESIS_HASH } from './audit-chain';
import { runWithRequestContext } from '../logging/request-context';

function makePrisma(lastHash: string | null = null) {
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve(data));
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    auditLog: {
      findFirst: jest.fn().mockResolvedValue(lastHash ? { hash: lastHash } : null),
      create,
    },
  };
  const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { prisma: prisma as never, create };
}

describe('writeChainedAuditLog', () => {
  it('encadeia no GENESIS e classifica módulo/eventType', async () => {
    const { prisma, create } = makePrisma();
    await writeChainedAuditLog(prisma, { userId: 5, action: 'ROLE_CREATED', entity: 'Role' });
    const data = create.mock.calls[0][0].data;
    expect(data.previousHash).toBe(GENESIS_HASH);
    expect(data.hash).toHaveLength(64);
    expect(data.module).toBe('Roles & Permissions');
    expect(data.eventType).toBe('Roles & Permissions.ROLE_CREATED');
    expect(data.actorType).toBe('USER');
  });

  it('liga ao hash anterior', async () => {
    const { prisma, create } = makePrisma('abc');
    await writeChainedAuditLog(prisma, { userId: 5, action: 'X', entity: 'User' });
    expect(create.mock.calls[0][0].data.previousHash).toBe('abc');
  });

  it('userId 0 sem pedido em curso grava evento de sistema (null), sem violar a FK', async () => {
    const { prisma, create } = makePrisma();
    await writeChainedAuditLog(prisma, { userId: 0, action: 'ROLE_CREATED', entity: 'Role' });
    const data = create.mock.calls[0][0].data;
    expect(data.userId).toBeNull();
    expect(data.actorType).toBe('SYSTEM');
  });

  it('userId 0 dentro de um pedido usa o autor autenticado', async () => {
    const { prisma, create } = makePrisma();
    await runWithRequestContext({ reqId: 'req-1', userId: 42 }, () =>
      writeChainedAuditLog(prisma, { userId: 0, action: 'ROLE_CREATED', entity: 'Role' }),
    );
    const data = create.mock.calls[0][0].data;
    expect(data.userId).toBe(42);
    expect(data.correlationId).toBe('req-1');
    expect(data.source).toBe('API');
  });
});
