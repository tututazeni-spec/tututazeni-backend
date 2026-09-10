import { Module } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { LeadershipController } from './leadership.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';

@Module({
  imports: [PrismaModule, OneOnOneModule],
  providers: [LeadershipService, LeadershipProgramsService],
  controllers: [LeadershipController],
  exports: [LeadershipService, LeadershipProgramsService],
})
export class LeadershipModule {}
