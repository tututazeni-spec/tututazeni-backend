import {
  buildRecommendations,
  trendPercent,
  RecommendationInput,
} from './scalability-recommendations.service';

const base: RecommendationInput = {
  resources: [{ key: 'db', label: 'DB connections', percent: 40 }],
  autoScaling: { enabled: true, decision: 'HOLD', recommendedInstances: 1, currentInstances: 1 },
  resilienceChecks: [{ key: 'dr', label: 'Disaster recovery', status: 'OK', detail: '' }],
  queues: { failed: 0, pending: 0, throughputPerMin: 10 },
  hourly: [],
};

describe('trendPercent', () => {
  it('devolve null com poucos dados', () => {
    expect(trendPercent([1, 2, 3])).toBeNull();
  });
  it('compara as duas metades', () => {
    expect(trendPercent([...Array(6).fill(10), ...Array(6).fill(15)])).toBe(50);
  });
});

describe('buildRecommendations', () => {
  it('sem problemas não recomenda nada', () => {
    expect(buildRecommendations(base)).toEqual([]);
  });

  it('ordena por prioridade e cobre várias áreas', () => {
    const r = buildRecommendations({
      ...base,
      resources: [{ key: 'db', label: 'DB connections', percent: 95 }],
      autoScaling: {
        enabled: false,
        decision: 'SCALE_UP',
        recommendedInstances: 3,
        currentInstances: 1,
      },
      resilienceChecks: [{ key: 'dr', label: 'Disaster recovery', status: 'ATENCAO', detail: 'x' }],
      queues: { failed: 5, pending: 600, throughputPerMin: 10 },
    });
    expect(r[0].priority).toBe('ALTA');
    const keys = r.map(x => x.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'capacity-db',
        'autoscaling-instances',
        'autoscaling-disabled',
        'resilience-dr',
        'queues-failed',
        'queues-backlog',
      ]),
    );
    expect(r[r.length - 1].priority).not.toBe('ALTA');
  });

  it('assinala tendência de CPU em crescimento', () => {
    const hourly = [
      ...Array(6).fill({ avgCpu: 20, maxCpu: 30, maxP95Ms: 100 }),
      ...Array(6).fill({ avgCpu: 40, maxCpu: 60, maxP95Ms: 100 }),
    ];
    expect(buildRecommendations({ ...base, hourly }).map(x => x.key)).toContain('trend-cpu');
  });
});
