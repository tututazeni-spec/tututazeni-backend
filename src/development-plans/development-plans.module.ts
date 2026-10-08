// src/development-plans/development-plans.module.ts
import { Module } from '@nestjs/common';
import { DevelopmentPlansService } from './development-plans.service';
import { DevelopmentPlansController } from './development-plans.controller';
import { TalentDevelopmentService } from './talent-development.service';
import { TalentDevelopmentController } from './talent-development.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DevelopmentPlansService, TalentDevelopmentService],
  controllers: [DevelopmentPlansController, TalentDevelopmentController],
  exports: [DevelopmentPlansService, TalentDevelopmentService],
})
export class DevelopmentPlansModule {}
