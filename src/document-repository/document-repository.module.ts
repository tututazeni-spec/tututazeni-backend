import { Module } from '@nestjs/common';
import { DocumentRepositoryService } from './document-repository.service';
import { DocumentRepositoryController } from './document-repository.controller';
 
@Module({
  providers: [DocumentRepositoryService],
  controllers: [DocumentRepositoryController],
  exports: [DocumentRepositoryService],
})
export class DocumentRepositoryModule {}
 
