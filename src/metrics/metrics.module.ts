import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import {
  PrometheusModule,
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  getToken,
} from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { QueueMetricsService } from './queue-metrics.service';

@Global()
@Module({
  imports: [
    // registerAsync defers collectDefaultMetrics() to provider-instantiation time
    // (inside compile()), so register.clear() in tests does not wipe the defaults.
    PrometheusModule.registerAsync({
      controller: MetricsController,
      useFactory: () => ({ defaultMetrics: { enabled: true } }),
    }),
    BullModule.registerQueue(
      { name: 'audit' },
      { name: 'email' },
      { name: 'notifications' },
      { name: 'webhooks' },
    ),
  ],
  providers: [
    makeCounterProvider({
      name: 'cache_requests_total',
      help: 'Total de acessos ao cache por resultado (hit/miss)',
      labelNames: ['result'],
    }),
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duração dos pedidos HTTP em segundos',
      labelNames: ['method', 'route', 'status_code'],
    }),
    makeHistogramProvider({
      name: 'prisma_query_duration_seconds',
      help: 'Duração das queries Prisma em segundos',
      labelNames: ['target'],
    }),
    makeGaugeProvider({
      name: 'bull_queue_jobs',
      help: 'Jobs nas filas Bull por estado (waiting/active/delayed/failed)',
      labelNames: ['queue', 'state'],
    }),
    makeGaugeProvider({
      name: 'cron_last_run_timestamp_seconds',
      help: 'Instante (epoch s) da última execução bem-sucedida de cada tarefa agendada',
      labelNames: ['job'],
    }),
    makeCounterProvider({
      name: 'cron_runs_total',
      help: 'Execuções de tarefas agendadas por resultado (ok/error)',
      labelNames: ['job', 'result'],
    }),
    QueueMetricsService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [
    getToken('cache_requests_total'),
    getToken('prisma_query_duration_seconds'),
    getToken('cron_last_run_timestamp_seconds'),
    getToken('cron_runs_total'),
  ],
})
export class MetricsModule {}
