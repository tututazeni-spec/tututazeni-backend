import { Module } from '@nestjs/common';
import { CourseCompletionService } from './course-completion.service';
import { GamificationModule } from '../gamification/gamification.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [GamificationModule, CertificatesModule],
  providers: [CourseCompletionService],
  exports: [CourseCompletionService],
})
export class CourseCompletionModule {}
