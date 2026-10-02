// src/process-standard/process-standard.module.ts
import { Module } from '@nestjs/common';
import { ProcessStandardController } from './process-standard.controller';
import { ProcessStandardService } from './process-standard.service';
import { ProcessInstancesService } from './process-instances.service';
import { ProcessTasksService } from './process-tasks.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProcessStandardController],
  providers: [ProcessStandardService, ProcessInstancesService, ProcessTasksService],
  exports: [ProcessStandardService],
})
export class ProcessStandardModule {}
