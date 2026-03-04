import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CareerPlansService } from './career-plans.service';
import { CareerPlansController } from './career-plans.controller';

@Module({
  controllers: [CareerPlansController],
  providers: [CareerPlansService, PrismaService],
})
export class CareerPlansModule {}