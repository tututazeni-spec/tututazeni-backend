import { Module } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { LeadershipController } from './leadership.controller';
 
@Module({
  providers: [LeadershipService],
  controllers: [LeadershipController],
  exports: [LeadershipService],
})
export class LeadershipModule {}
 
