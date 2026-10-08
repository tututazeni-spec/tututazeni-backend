import { Module } from '@nestjs/common';
import { LiveClassesService } from './live-classes.service';
import { LiveClassesController } from './live-classes.controller';
import { CourseCompletionModule } from '../course-completion/course-completion.module';

@Module({
  imports: [CourseCompletionModule],
  providers: [LiveClassesService],
  controllers: [LiveClassesController],
  exports: [LiveClassesService],
})
export class LiveClassesModule {}
