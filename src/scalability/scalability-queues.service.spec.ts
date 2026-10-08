import { ScalabilityQueuesService } from './scalability-queues.service';

const fakeQueue = (
  counts: Record<string, number>,
  completed: unknown[] = [],
  failed: unknown[] = [],
) =>
  ({
    getJobCounts: jest
      .fn()
      .mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, ...counts }),
    getCompleted: jest.fn().mockResolvedValue(completed),
    getFailed: jest.fn().mockResolvedValue(failed),
  }) as never;

function build(enabled = true, queueOverride?: never) {
  const now = Date.now();
  const email =
    queueOverride ??
    fakeQueue(
      { waiting: 4, active: 1, delayed: 2, failed: 1, completed: 10 },
      [
        { processedOn: now - 3000, finishedOn: now - 1000, attemptsMade: 1 },
        { processedOn: now - 5000, finishedOn: now - 2000, attemptsMade: 3 },
      ],
      [{ finishedOn: now, failedReason: 'SMTP timeout', attemptsMade: 5 }],
    );
  const prisma = {
    automationExecution: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'SUCCESS', _count: { _all: 7 } },
        { status: 'FAILED', _count: { _all: 2 } },
        { status: 'PENDING', _count: { _all: 3 } },
      ]),
      findMany: jest
        .fn()
        .mockResolvedValue([{ startedAt: new Date(now - 2000), finishedAt: new Date(now) }]),
      count: jest.fn().mockResolvedValue(1),
    },
    integrationSyncLog: {
      groupBy: jest.fn().mockResolvedValue([{ status: 'RUNNING', _count: { _all: 1 } }]),
    },
  };
  const config = { get: jest.fn().mockReturnValue(enabled ? 'true' : 'false') };
  const svc = new ScalabilityQueuesService(
    fakeQueue({}),
    email,
    fakeQueue({}),
    fakeQueue({}),
    prisma as never,
    config as never,
  );
  return svc;
}

describe('ScalabilityQueuesService', () => {
  it('agrega filas Bull e jobs de BD', async () => {
    const r = await build().getQueueMetrics();
    expect(r.mode).toBe('QUEUE');
    expect(r.queues).toHaveLength(4);
    const email = r.queues.find(q => q.key === 'email')!;
    expect(email.queueSize).toBe(6); // waiting + delayed
    expect(email.avgDurationMs).toBe(2500);
    expect(email.retries).toBe(2 + 4); // (3-1) + (5-1)
    expect(email.lastFailure?.reason).toBe('SMTP timeout');
    expect(r.totals.executed).toBe(10 + 9 + 0);
    expect(r.totals.pending).toBe(4 + 3);
    expect(r.totals.failed).toBe(1 + 2);
    expect(r.depthHistory).toHaveLength(1);
  });

  it('com QUEUE_ENABLED=false não toca em Redis', async () => {
    const r = await build(false).getQueueMetrics();
    expect(r.mode).toBe('SYNC');
    expect(r.queues).toEqual([]);
    expect(r.dbJobs).toHaveLength(2);
  });

  it('Redis em baixo degrada para só jobs de BD', async () => {
    const broken = {
      getJobCounts: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
    } as never;
    const r = await build(true, broken).getQueueMetrics();
    expect(r.redisAvailable).toBe(false);
    expect(r.queues).toEqual([]);
    expect(r.totals.executed).toBe(9);
  });
});
