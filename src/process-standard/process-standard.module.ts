// src/process-standard/process-standard.module.ts
import { Module } from '@nestjs/common';
import { ProcessStandardController } from './process-standard.controller';
import { ProcessStandardService } from './process-standard.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProcessStandardController],
  providers: [ProcessStandardService],
  exports: [ProcessStandardService],
})
export class ProcessStandardModule {}
