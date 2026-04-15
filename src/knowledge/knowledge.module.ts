import { Module } from '@nestjs/common';
import { KnowledgeService }    from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { PrismaModule }        from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  providers:   [KnowledgeService],
  controllers: [KnowledgeController],
  exports:     [KnowledgeService],
})
export class KnowledgeModule {}
