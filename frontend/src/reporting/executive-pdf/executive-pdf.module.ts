import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutivePdfService } from './executive-pdf.service';
import { ExecutivePdfController } from './executive-pdf.controller';

@Module({
  controllers: [ExecutivePdfController],
  providers: [ExecutivePdfService, PrismaService],
  exports: [ExecutivePdfService],
})
export class ExecutivePdfModule {}