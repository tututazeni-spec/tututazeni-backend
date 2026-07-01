import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = { isHealthy: jest.fn() } as any;
  const redis = { check: jest.fn() } as any;
  const health = { check: jest.fn() } as any;
  const controller = new HealthController(health, prisma, redis);
  beforeEach(() => jest.clearAllMocks());

  it('live: responde ok com uptime, sem tocar em dependências', () => {
    const res = controller.live();
    expect(res.status).toBe('ok');
    expect(typeof res.uptime).toBe('number');
    expect(health.check).not.toHaveBeenCalled();
  });

  it('ready: Postgres up + Redis down → status ok (200) com redis down nos detalhes', async () => {
    health.check.mockResolvedValue({
      status: 'ok',
      info: { postgres: { status: 'up' } },
      error: {},
      details: { postgres: { status: 'up' } },
    });
    redis.check.mockResolvedValue({ redis: { status: 'down', error: 'x' } });
    const res = await controller.ready();
    expect(res.status).toBe('ok');
    expect(res.info.redis.status).toBe('down');
    expect(res.details.redis.status).toBe('down');
  });

  it('ready: passa só o indicador do Postgres ao terminus (Redis não derruba o 503)', async () => {
    health.check.mockResolvedValue({ status: 'ok', info: {}, error: {}, details: {} });
    redis.check.mockResolvedValue({ redis: { status: 'up' } });
    await controller.ready();
    expect(health.check).toHaveBeenCalledTimes(1);
    expect(health.check.mock.calls[0][0]).toHaveLength(1); // só postgres
  });
});
