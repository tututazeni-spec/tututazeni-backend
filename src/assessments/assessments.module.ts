// src/assessments/assessments.module.ts
import { Module } from '@nestjs/common';
import { AssessmentsService }    from './assessments.service';
import { AssessmentsController } from './assessments.controller';
import { PrismaModule }          from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  providers:   [AssessmentsService],
  controllers: [AssessmentsController],
  exports:     [AssessmentsService],
})
export class AssessmentsModule {}