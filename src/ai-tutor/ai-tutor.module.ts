// src/ai-tutor/ai-tutor.module.ts
import { Module } from '@nestjs/common';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorController } from './ai-tutor.controller';
import { AiProvidersService } from './ai-providers.service';
import { AiKnowledgeService } from './ai-knowledge.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AiProvidersService, AiTutorService, AiKnowledgeService],
  controllers: [AiTutorController],
  exports: [AiTutorService, AiProvidersService, AiKnowledgeService],
})
export class AiTutorModule {}
