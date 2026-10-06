// Ponto de encaixe para o futuro módulo Monitoring.
//
// O Scalability grava requests/min, latência, erros, disco, etc. em cada
// ScalabilityMetric mas não tem fonte própria para esses valores (só mede
// CPU, memória e sessões). Quando o módulo Monitoring existir, basta:
//   1. implementar TrafficMetricsSource;
//   2. registá-lo com { provide: TRAFFIC_METRICS_SOURCE, useExisting: ... };
//   3. exportar o token e importar o módulo em ScalabilityModule.
// Sem provider, o Scalability continua a funcionar e devolve 0 nestes campos
// (o frontend avisa que não há fonte ligada).

export const TRAFFIC_METRICS_SOURCE = Symbol('TRAFFIC_METRICS_SOURCE');

export interface TrafficMetrics {
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  requestsPerMinute: number;
  apiCallsPerMin: number;
  /** percentagem 0–100 */
  errorRate: number;
  uptimePercent: number;
  diskUsagePercent: number;
  storageUsedGb: number;
  bandwidthMbps: number;
  videoStreamCount: number;
}

export interface TrafficMetricsSource {
  /** Valores agregados do último minuto; campos em falta ficam a 0 (uptime 100). */
  getTrafficMetrics(): Promise<Partial<TrafficMetrics>>;
}
