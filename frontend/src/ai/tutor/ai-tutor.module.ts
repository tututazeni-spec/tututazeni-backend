import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpModule } from '@nestjs/axios';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorController } from './ai-tutor.controller';

@Module({
  imports: [HttpModule],
  controllers: [AiTutorController],
  providers: [AiTutorService, PrismaService],
  exports: [AiTutorService],
})
export class AiTutorModule {}