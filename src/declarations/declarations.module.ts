// ─── src/declarations/declarations.module.ts ─────────────────────────────────

import { Module } from '@nestjs/common';
import { DocumentDeclarationsService } from './document-declarations.service';
import { WorkDeclarationsService } from './work-declarations.service';
import { DocumentDeclarationsController } from './declarations.controller';
import { WorkDeclarationsController } from './declarations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [DocumentDeclarationsService, WorkDeclarationsService],
  controllers: [DocumentDeclarationsController, WorkDeclarationsController],
  exports: [DocumentDeclarationsService, WorkDeclarationsService],
})
export class DeclarationsModule {}
