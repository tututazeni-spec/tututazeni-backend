import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';
import { WorkDeclarationController } from './work-declaration.controller';
import { WorkDeclarationService } from './work-declaration.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, PdfModule, UsersModule, NotificationsModule],
  controllers: [WorkDeclarationController],
  providers: [WorkDeclarationService],
  exports: [WorkDeclarationService],
})
export class WorkDeclarationModule {}
