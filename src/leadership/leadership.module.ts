import { Module } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { LeadershipController } from './leadership.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LeadershipService],
  controllers: [LeadershipController],
  exports: [LeadershipService],
})
export class LeadershipModule {}
