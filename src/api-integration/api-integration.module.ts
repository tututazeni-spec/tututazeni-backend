// src/api-integration/api-integration.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule }           from '../prisma/prisma.module';
import { ApiIntegrationService }  from './api-integration.service';
import { ApiIntegrationController } from './api-integration.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [ApiIntegrationService],
  controllers: [ApiIntegrationController],
  exports:     [ApiIntegrationService],
})
export class ApiIntegrationModule {}
