// src/automation/automation.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule }    from '../prisma/prisma.module';
import { AutomationService }    from './automation.service';
import { AutomationController } from './automation.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [AutomationService],
  controllers: [AutomationController],
  exports:     [AutomationService],
})
export class AutomationModule {}

