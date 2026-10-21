// src/ai-tutor/ai-tutor.module.ts
import { Module } from '@nestjs/common';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorController } from './ai-tutor.controller';
import { AiProvidersService } from './ai-providers.service';
import { AiKnowledgeService } from './ai-knowledge.service';
import { AiDataAccessService } from './ai-data-access.service';
import { SimliService } from './simli.service';
import { IsisSpeechService } from './isis-speech.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, SettingsModule],
  providers: [
    AiProvidersService,
    AiTutorService,
    AiKnowledgeService,
    AiDataAccessService,
    SimliService,
    IsisSpeechService,
  ],
  controllers: [AiTutorController],
  exports: [AiTutorService, AiProvidersService, AiKnowledgeService],
})
export class AiTutorModule {}
