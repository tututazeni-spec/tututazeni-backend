import { Module } from '@nestjs/common';
import { LeaderService } from './leader.service';
import { LeaderController } from './leader.controller';
@Module({ providers: [LeaderService], controllers: [LeaderController], exports: [LeaderService] })
export class LeaderModule {}
 

