import { Module } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { LeadershipEligibilityService } from './leadership-eligibility.service';
import { LeadershipParticipantsService } from './leadership-participants.service';
import { LeadershipExecutionService } from './leadership-execution.service';
import { LeadershipController } from './leadership.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, OneOnOneModule, NotificationsModule],
  providers: [
    LeadershipService,
    LeadershipProgramsService,
    LeadershipEligibilityService,
    LeadershipParticipantsService,
    LeadershipExecutionService,
  ],
  controllers: [LeadershipController],
  exports: [
    LeadershipService,
    LeadershipProgramsService,
    LeadershipEligibilityService,
    LeadershipParticipantsService,
    LeadershipExecutionService,
  ],
})
export class LeadershipModule {}
