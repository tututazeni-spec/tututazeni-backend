import { rollupHour, RawMetricRow } from './scalability-history.service';

const row = (o: Partial<RawMetricRow>): RawMetricRow => ({
  cpuUsagePercent: 0,
  memoryUsagePercent: 0,
  diskUsagePercent: 0,
  activeUsers: 0,
  concurrentSessions: 0,
  avgLatencyMs: 0,
  p95LatencyMs: 0,
  p99LatencyMs: 0,
  requestsPerMinute: 0,
  errorRate: 0,
  storageUsedGb: 0,
  ...o,
});

describe('rollupHour', () => {
  it('usa médias para taxas e máximos para picos', () => {
    const h = new Date('2026-10-05T10:00:00Z');
    const r = rollupHour(h, [
      row({ cpuUsagePercent: 20, activeUsers: 10, p95LatencyMs: 100, requestsPerMinute: 50 }),
      row({ cpuUsagePercent: 80, activeUsers: 40, p95LatencyMs: 900, requestsPerMinute: 150 }),
    ]);
    expect(r.samples).toBe(2);
    expect(r.avgCpu).toBe(50);
    expect(r.maxCpu).toBe(80);
    expect(r.maxActiveUsers).toBe(40);
    expect(r.maxP95Ms).toBe(900);
    expect(r.avgRpm).toBe(100);
    expect(r.maxRpm).toBe(150);
    expect(r.hour).toBe(h);
  });
});
