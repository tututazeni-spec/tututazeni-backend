import { PrismaHealthIndicator } from './prisma.health';

describe('PrismaHealthIndicator', () => {
  it('Postgres up: status up com latência', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any;
    const result = await new PrismaHealthIndicator(prisma).isHealthy('postgres');
    expect(result.postgres.status).toBe('up');
    expect(typeof result.postgres.latencyMs).toBe('number');
  });

  it('Postgres down: status down com erro (sem lançar)', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('ECONN')) } as any;
    const result = await new PrismaHealthIndicator(prisma).isHealthy('postgres');
    expect(result.postgres.status).toBe('down');
    expect(result.postgres.error).toContain('ECONN');
  });
});
