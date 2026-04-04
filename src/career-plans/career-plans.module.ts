import { Module } from '@nestjs/common';
import { CareerPlansService } from './career-plans.service';
import { CareerPlansController } from './career-plans.controller';
 
@Module({
  providers: [CareerPlansService],
  controllers: [CareerPlansController],
  exports: [CareerPlansService],
})
export class CareerPlansModule {}
 
