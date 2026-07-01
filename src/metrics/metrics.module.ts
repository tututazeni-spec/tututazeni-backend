import { Global, Module } from '@nestjs/common';
import { PrometheusModule, makeCounterProvider, getToken } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';

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
  ],
  exports: [getToken('cache_requests_total')],
})
export class MetricsModule {}
