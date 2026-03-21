import { Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/user.decorator';

@Controller('enrollments')
@UseGuards(JwtAuthGuard)
export class EnrollmentsController {
  constructor(private service: EnrollmentsService) {}

  @Post(':courseId')
  enroll(@CurrentUser() user: any, @Param('courseId') courseId: string) {
    return this.service.enroll(user.sub, courseId);
  }

  @Patch(':id/lessons/:lessonId/complete')
  completeLesson(
    @Param('id') enrollmentId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.service.markLessonCompleted(enrollmentId, lessonId);
  }
}
