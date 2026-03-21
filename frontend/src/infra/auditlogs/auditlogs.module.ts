import { Module } from '@nestjs/common';
import { AuditLogsService } from './auditlogs.service';
import { AuditLogsController } from './auditlogs.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AuditLogsService],
  controllers: [AuditLogsController],
})
export class AuditLogsModule {}
