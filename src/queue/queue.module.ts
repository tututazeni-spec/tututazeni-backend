import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', '127.0.0.1'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          // Base lógica do Redis: os testes de integração usam outra (REDIS_DB em
          // .env.test) para que um backend de desenvolvimento a correr no mesmo Redis
          // não consuma os jobs das filas do teste.
          db: Number(config.get<string>('REDIS_DB', '0')),
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
