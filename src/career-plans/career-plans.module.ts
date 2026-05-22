// ─── src/career-plans/career-plans.module.ts ─────────────────────────────────

import { Module } from '@nestjs/common';
import { CareerPlansService } from './career-plans.service';
import { CareerPlansController } from './career-plans.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [CareerPlansService],
  controllers: [CareerPlansController],
  exports: [CareerPlansService],
})
export class CareerPlansModule {}
