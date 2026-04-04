import { Module } from '@nestjs/common';
import { WorkDeclarationService } from './work-declaration.service';
import { WorkDeclarationController } from './work-declaration.controller';
 
@Module({
  providers: [WorkDeclarationService],
  controllers: [WorkDeclarationController],
  exports: [WorkDeclarationService],
})
export class WorkDeclarationModule {}
 
