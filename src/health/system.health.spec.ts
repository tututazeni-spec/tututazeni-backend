import { SystemHealthIndicator } from './system.health';

const queue = (counts: Record<string, number>) => ({
  getJobCounts: jest.fn().mockResolvedValue(counts),
});

describe('SystemHealthIndicator', () => {
  const ok = { waiting: 0, active: 0, failed: 0 };

  it('queues: up com contagens por fila', async () => {
    const s = new SystemHealthIndicator(
      queue(ok) as any,
      queue(ok) as any,
      queue(ok) as any,
      queue(ok) as any,
    );
    const r = await s.queues('queues');
    expect(r.queues.status).toBe('up');
    expect(Object.keys(r.queues.queues as object)).toEqual([
      'audit',
      'email',
      'notifications',
      'webhooks',
    ]);
  });

  it('queues: muitas falhas acumuladas → degraded', async () => {
    const s = new SystemHealthIndicator(
      queue({ ...ok, failed: 60 }) as any,
      queue(ok) as any,
      queue(ok) as any,
      queue(ok) as any,
    );
    const r = (await s.queues('queues')).queues;
    expect(r.level).toBe('degraded');
    expect(r.status).toBe('up');
  });

  it('queues: Redis em baixo → down com erro', async () => {
    const bad = { getJobCounts: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const s = new SystemHealthIndicator(
      bad as any,
      queue(ok) as any,
      queue(ok) as any,
      queue(ok) as any,
    );
    const r = await s.queues('queues');
    expect(r.queues.status).toBe('down');
    expect(r.queues.error).toBe('ECONNREFUSED');
  });

  it('disk, memory e eventLoop devolvem estado e números', async () => {
    const s = new SystemHealthIndicator(
      queue(ok) as any,
      queue(ok) as any,
      queue(ok) as any,
      queue(ok) as any,
    );
    expect((await s.disk('disk')).disk.freePct).toBeGreaterThan(0);
    expect(s.memory('memory').memory.heapLimitMb).toBeGreaterThan(0);
    expect(s.eventLoop('eventLoop').eventLoop.level).toBeDefined();
  });
});
