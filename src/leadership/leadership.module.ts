import { Module } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { LeadershipController } from './leadership.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';

@Module({
  imports: [PrismaModule, OneOnOneModule],
  providers: [LeadershipService],
  controllers: [LeadershipController],
  exports: [LeadershipService],
})
export class LeadershipModule {}
