import { Module } from '@nestjs/common';
import { LeaderService } from './leader.service';
import { LeaderController } from './leader.controller';
import { AuthModule } from '../auth/auth.module'; 

@Module({
  imports: [AuthModule], 
  providers: [LeaderService],
  controllers: [LeaderController],
})
export class LeaderModule {}

