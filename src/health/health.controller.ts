import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { Public } from '../common/decorators';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { SystemHealthIndicator } from './system.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly system: SystemHealthIndicator,
  ) {}

  // Liveness: a app está viva. Não toca em dependências → sempre 200.
  @Get()
  @Public()
  live() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      version: process.env.BUILD_SHA ?? 'unknown',
    };
  }

  @Get('live')
  @Public()
  liveAlias() {
    return this.live();
  }

  // Readiness: Postgres é crítico (controla o 503). Redis, filas, disco, heap e
  // event loop são informativos — aparecem em `details` com estado e números.
  @Get('ready')
  @Public()
  @HealthCheck()
  async ready(): Promise<HealthCheckResult> {
    const result = await this.health.check([() => this.prisma.isHealthy('postgres')]);
    const extras = Object.assign(
      {},
      ...(await Promise.all([
        this.redis.check('redis'),
        this.system.queues('queues'),
        this.system.disk('disk'),
      ])),
      this.system.memory('memory'),
      this.system.eventLoop('eventLoop'),
    );
    return {
      ...result,
      info: { ...result.info, ...extras },
      details: { ...result.details, ...extras },
    };
  }
}
