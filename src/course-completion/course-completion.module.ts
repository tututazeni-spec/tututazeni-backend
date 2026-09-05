import { Module } from '@nestjs/common';
import { CourseCompletionService } from './course-completion.service';

@Module({
  providers: [CourseCompletionService],
  exports: [CourseCompletionService],
})
export class CourseCompletionModule {}
