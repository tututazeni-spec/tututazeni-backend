// src/roi-impact/roi-impact.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule }     from '../prisma/prisma.module';
import { RoiImpactService } from './roi-impact.service';
import { RoiImpactController } from './roi-impact.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [RoiImpactService],
  controllers: [RoiImpactController],
  exports:     [RoiImpactService],
})
export class RoiImpactModule {}
