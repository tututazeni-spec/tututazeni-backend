import { Module } from '@nestjs/common';
import { InstructorService } from './instructor.service';
import { InstructorController } from './instructor.controller';
 
@Module({
  providers: [InstructorService],
  controllers: [InstructorController],
  exports: [InstructorService],
})
export class InstructorModule {}
 
