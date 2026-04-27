// ─── src/document-repository/document-repository.module.ts ───────────────────

import { Module }                       from '@nestjs/common';
import { DocumentRepositoryService }    from './document-repository.service';
import { DocumentRepositoryController } from './document-repository.controller';
import { PrismaModule }                 from '../prisma/prisma.module';
import { AuditModule }                  from '../common/modules/audit.module';
 
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [DocumentRepositoryService],
  controllers: [DocumentRepositoryController],
  exports: [DocumentRepositoryService],
})
export class DocumentRepositoryModule {}
