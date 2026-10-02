// src/process-standard/process-standard.module.ts
import { Module } from '@nestjs/common';
import { ProcessStandardController } from './process-standard.controller';
import { ProcessStandardService } from './process-standard.service';
import { ProcessInstancesService } from './process-instances.service';
import { ProcessTasksService } from './process-tasks.service';
import { ProcessEngineService } from './process-engine.service';
import { ProcessApprovalsService } from './process-approvals.service';
import { ProcessAutomationsService } from './process-automations.service';
import { ProcessAutomationActions } from './process-automation-actions';
import { ProcessSchedulerService } from './process-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationModule } from '../automation/automation.module';

// O motor de automações é único (AutomationModule): os processos emitem-lhe eventos
// e registam as suas acções, sem duplicar a lógica de regras.
@Module({
  imports: [PrismaModule, AutomationModule],
  controllers: [ProcessStandardController],
  providers: [
    ProcessStandardService,
    ProcessInstancesService,
    ProcessTasksService,
    ProcessEngineService,
    ProcessApprovalsService,
    ProcessAutomationsService,
    ProcessAutomationActions,
    ProcessSchedulerService,
  ],
  exports: [ProcessStandardService],
})
export class ProcessStandardModule {}
