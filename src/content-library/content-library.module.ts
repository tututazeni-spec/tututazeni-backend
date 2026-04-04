import { Module } from '@nestjs/common';
import { ContentLibraryService } from './content-library.service';
import { ContentLibraryController } from './content-library.controller';
@Module({ providers: [ContentLibraryService], controllers: [ContentLibraryController], exports: [ContentLibraryService] })
export class ContentLibraryModule {}
 
