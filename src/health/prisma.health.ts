import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { [key]: { status: 'up', latencyMs: Date.now() - start } };
    } catch (e) {
      return {
        [key]: { status: 'down', error: e instanceof Error ? e.message : String(e) },
      };
    }
  }
}
