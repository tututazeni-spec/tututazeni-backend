import { Module } from '@nestjs/common';
import { ScalabilityService } from './scalability.service';
import { ScalabilityController } from './scalability.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ScalabilityController],
  providers: [ScalabilityService],
  exports: [ScalabilityService],
})
export class ScalabilityModule {}