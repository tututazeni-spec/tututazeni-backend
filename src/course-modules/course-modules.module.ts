import { Module } from '@nestjs/common';
import { CourseModulesService } from './course-modules.service';
import { CourseModulesController } from './course-modules.controller';
import { CourseCompletionModule } from '../course-completion/course-completion.module';

@Module({
  imports: [CourseCompletionModule],
  providers: [CourseModulesService],
  controllers: [CourseModulesController],
  exports: [CourseModulesService],
})
export class CourseModulesModule {}
