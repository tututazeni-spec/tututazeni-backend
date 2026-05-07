// src/career/career.module.ts
import { Module } from '@nestjs/common';
import { CareerService }    from './career.service';
import { CareerController } from './career.controller';
import { PrismaModule }     from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  providers:   [CareerService],
  controllers: [CareerController],
  exports:     [CareerService],
})
export class CareerModule {}