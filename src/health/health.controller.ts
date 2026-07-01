import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { Public } from '../common/decorators';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  // Liveness: a app está viva. Não toca em dependências → sempre 200.
  @Get()
  @Public()
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Get('live')
  @Public()
  liveAlias() {
    return this.live();
  }

  // Readiness: Postgres é crítico (controla o 503). Redis é informativo.
  @Get('ready')
  @Public()
  @HealthCheck()
  async ready(): Promise<HealthCheckResult> {
    const result = await this.health.check([() => this.prisma.isHealthy('postgres')]);
    const redis = await this.redis.check('redis');
    return {
      ...result,
      info: { ...result.info, ...redis },
      details: { ...result.details, ...redis },
    };
  }
}
