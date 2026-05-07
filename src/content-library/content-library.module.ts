// src/content-library/content-library.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule }              from '../prisma/prisma.module';
import { ContentLibraryService }     from './content-library.service';
import { ContentLibraryController }  from './content-library.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [ContentLibraryService],
  controllers: [ContentLibraryController],
  exports:     [ContentLibraryService],
})
export class ContentLibraryModule {}
