// src/ai-tutor/ai-tutor.module.ts
import { Module } from '@nestjs/common';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorController } from './ai-tutor.controller';
import { AiProvidersService } from './ai-providers.service';
 
@Module({
  providers: [AiProvidersService, AiTutorService],
  controllers: [AiTutorController],
  exports: [AiTutorService, AiProvidersService],
})
export class AiTutorModule {}
 
