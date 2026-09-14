import { Module } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { LeadershipEligibilityService } from './leadership-eligibility.service';
import { LeadershipParticipantsService } from './leadership-participants.service';
import { LeadershipExecutionService } from './leadership-execution.service';
import { LeadershipAnalyticsService } from './leadership-analytics.service';
import { LeadershipController } from './leadership.controller';
import { LeaderService } from './leader.service';
import { LeaderController } from './leader.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';

// Módulo único de Liderança: funde o antigo LeaderModule (gestão de equipa —
// dashboard do líder, 1:1s, feedback, PDIs, talent pipeline) com o
// LeadershipModule (programas de liderança, elegibilidade, mentoring,
// feedback 360°, kudos, ranking). Nenhum conteúdo dos dois módulos foi
// removido — LeaderController continua em `/leaders`, LeadershipController
// continua em `/leadership`; apenas passam a ser registados por um único
// @Module (ver Sidebar "Liderança" no frontend).
@Module({
  imports: [PrismaModule, OneOnOneModule, NotificationsModule, DevelopmentPlansModule],
  providers: [
    LeadershipService,
    LeadershipProgramsService,
    LeadershipEligibilityService,
    LeadershipParticipantsService,
    LeadershipExecutionService,
    LeadershipAnalyticsService,
    LeaderService,
  ],
  controllers: [LeadershipController, LeaderController],
  exports: [
    LeadershipService,
    LeadershipProgramsService,
    LeadershipEligibilityService,
    LeadershipParticipantsService,
    LeadershipExecutionService,
    LeadershipAnalyticsService,
    LeaderService,
  ],
})
export class LeadershipModule {}
