// src/common/modules/audit.module.ts
import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditService } from '../services/audit.service';
import { AuditProcessor } from '../../queue/processors/audit.processor';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'audit' })],
  providers: [AuditService, AuditProcessor],
  exports: [AuditService],
})
export class AuditModule {}
