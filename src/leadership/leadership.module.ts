import { Module } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { LeadershipEligibilityService } from './leadership-eligibility.service';
import { LeadershipController } from './leadership.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';

@Module({
  imports: [PrismaModule, OneOnOneModule],
  providers: [LeadershipService, LeadershipProgramsService, LeadershipEligibilityService],
  controllers: [LeadershipController],
  exports: [LeadershipService, LeadershipProgramsService, LeadershipEligibilityService],
})
export class LeadershipModule {}
