// src/common/modules/audit.module.ts
import { Module, Global } from '@nestjs/common';
import { AuditService }   from '../services/audit.service';
import { PrismaModule }   from '../../prisma/prisma.module';
 
@Global()
@Module({
  imports:   [PrismaModule],
  providers: [AuditService],
  exports:   [AuditService],
})
export class AuditModule {}
