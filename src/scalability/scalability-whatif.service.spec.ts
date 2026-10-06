import { projectWhatIf } from './scalability-whatif.service';

const base = { totalUsers: 1000, concurrentPeak: 100, rps: 50, dbConnections: 20, storageGb: 10 };
const limits = {
  maxConcurrentUsers: 5000,
  maxApiRps: 800,
  dbMaxConnections: 100,
  storageTotalGb: 100,
  rpsPerInstance: 400,
  currentInstances: 1,
};

describe('projectWhatIf', () => {
  it('escala linearmente com os utilizadores', () => {
    const r = projectWhatIf(base, limits, 10_000);
    expect(r.concurrentUsers).toBe(1000);
    expect(r.resources.find(x => x.key === 'rps')?.projected).toBe(500);
    expect(r.resources.find(x => x.key === 'storage')?.projected).toBe(100);
    expect(r.verdict).toBe('CRITICO');
  });

  it('usa a percentagem de concorrência e recomenda instâncias', () => {
    const r = projectWhatIf(base, limits, 10_000, 30);
    expect(r.concurrentUsers).toBe(3000);
    expect(r.recommendations.some(t => t.includes('instâncias'))).toBe(true);
  });

  it('sem pressão devolve OK', () => {
    expect(projectWhatIf(base, limits, 1000).verdict).toBe('OK');
  });
});
