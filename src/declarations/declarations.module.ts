// ─── src/declarations/declarations.module.ts ─────────────────────────────────

import { Module } from '@nestjs/common';
import { WorkDeclarationsService } from './work-declarations.service';
import { DeclarationPurposeService } from './declaration-purpose.service';
import { DocumentDeclarationsController } from './declarations.controller';
import { WorkDeclarationsController } from './declarations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';
import { WorkDeclarationModule } from '../work-declaration/work-declaration.module';

@Module({
  imports: [PrismaModule, AuditModule, WorkDeclarationModule],
  providers: [WorkDeclarationsService, DeclarationPurposeService],
  controllers: [DocumentDeclarationsController, WorkDeclarationsController],
  exports: [WorkDeclarationsService],
})
export class DeclarationsModule {}
