import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator {
  private readonly logger = new Logger(PrismaHealthIndicator.name);

  constructor(private readonly prisma: PrismaService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { [key]: { status: 'up', latencyMs: Date.now() - start } };
    } catch (e: unknown) {
      this.logger.warn({
        key,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Health check Prisma falhou',
      });
      return {
        [key]: { status: 'down', error: e instanceof Error ? e.message : String(e) },
      };
    }
  }
}
