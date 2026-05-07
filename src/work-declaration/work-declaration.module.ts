import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';

import { WorkDeclarationController } from './work-declaration.controller';
import { WorkDeclarationService } from './work-declaration.service';

import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
        }
      },
    }),
    PrismaModule,
    PdfModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [WorkDeclarationController],
  providers: [WorkDeclarationService],
  exports: [WorkDeclarationService],
})
export class WorkDeclarationModule {}