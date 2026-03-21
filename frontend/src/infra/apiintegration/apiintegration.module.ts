import { Module } from '@nestjs/common';
import { ApiIntegrationService } from './apiintegration.service';
import { ApiIntegrationController } from './apiintegration.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ApiIntegrationService],
  controllers: [ApiIntegrationController],
})
export class ApiIntegrationModule {}
