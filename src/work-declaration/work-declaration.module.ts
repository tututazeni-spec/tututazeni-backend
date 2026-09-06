import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';
import { WorkDeclarationController } from './work-declaration.controller';
import { WorkDeclarationService } from './work-declaration.service';
import { LegacyDocumentDeclarationsService } from './legacy-document-declarations.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../common/modules/audit.module';

@Module({
  imports: [PrismaModule, PdfModule, UsersModule, NotificationsModule, AuditModule],
  controllers: [WorkDeclarationController],
  providers: [WorkDeclarationService, LegacyDocumentDeclarationsService],
  exports: [WorkDeclarationService, LegacyDocumentDeclarationsService],
})
export class WorkDeclarationModule {}
