import { Module } from '@nestjs/common';
import { DevelopmentPlansService } from './development-plans.service';
import { DevelopmentPlansController } from './development-plans.controller';
 
@Module({
  providers: [DevelopmentPlansService],
  controllers: [DevelopmentPlansController],
  exports: [DevelopmentPlansService],
})
export class DevelopmentPlansModule {}
 
