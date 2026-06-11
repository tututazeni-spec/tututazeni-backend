import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX || '50', 10),
      idleTimeoutMillis: 600000,
      connectionTimeoutMillis: 30000,
    });

    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: process.env.SLOW_QUERY_LOG ? [{ emit: 'event', level: 'query' }] : [],
    });
  }

  async onModuleInit() {
    await this.$connect();
    if (process.env.SLOW_QUERY_LOG) {
      const thresholdMs = parseInt(process.env.SLOW_QUERY_MS || '500', 10);
      const stream = fs.createWriteStream(
        process.env.SLOW_QUERY_LOG_FILE || 'load-tests/reports/slow-queries.log',
        { flags: 'a' },
      );
      (this as any).$on('query', (e: { query: string; params: string; duration: number }) => {
        if (e.duration >= thresholdMs) {
          stream.write(`${e.duration}ms | ${e.query} | params=${e.params}\n`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
