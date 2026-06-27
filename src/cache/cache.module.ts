import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { CACHE_REDIS } from './cache.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CACHE_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', '127.0.0.1'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: 2,
        }),
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class CacheModule {}
