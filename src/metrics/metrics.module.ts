import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
  getToken,
} from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';

@Global()
@Module({
  imports: [
    // registerAsync defers collectDefaultMetrics() to provider-instantiation time
    // (inside compile()), so register.clear() in tests does not wipe the defaults.
    PrometheusModule.registerAsync({
      controller: MetricsController,
      useFactory: () => ({ defaultMetrics: { enabled: true } }),
    }),
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
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [getToken('cache_requests_total')],
})
export class MetricsModule {}
