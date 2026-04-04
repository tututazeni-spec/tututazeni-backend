import { Module } from '@nestjs/common';
import { SuccessionService } from './succession.service';
import { SuccessionController } from './succession.controller';
 
@Module({
  providers: [SuccessionService],
  controllers: [SuccessionController],
  exports: [SuccessionService],
})
export class SuccessionModule {}
 
