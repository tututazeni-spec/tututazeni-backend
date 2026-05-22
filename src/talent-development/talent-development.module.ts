// src/talent-development/talent-development.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TalentDevelopmentService } from './talent-development.service';
import { TalentDevelopmentController } from './talent-development.controller';

@Module({
  imports: [PrismaModule],
  providers: [TalentDevelopmentService],
  controllers: [TalentDevelopmentController],
  exports: [TalentDevelopmentService],
})
export class TalentDevelopmentModule {}
