import { Module } from '@nestjs/common';
import { ContentLibraryService } from './contentlibrary.service';
import { ContentLibraryController } from './contentlibrary.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ContentLibraryService],
  controllers: [ContentLibraryController],
})
export class ContentLibraryModule {}
