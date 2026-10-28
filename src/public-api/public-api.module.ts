import { Module } from '@nestjs/common';
import { ApiIntegrationModule } from '../api-integration/api-integration.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyRateLimiter } from './api-key-rate-limiter';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

@Module({
  imports: [ApiIntegrationModule, EnrollmentsModule],
  controllers: [PublicApiController],
  providers: [PublicApiService, ApiKeyGuard, ApiKeyRateLimiter],
})
export class PublicApiModule {}
