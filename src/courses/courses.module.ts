import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { CohortsExportService } from './cohorts-export.service';
import { CohortSessionsService } from './cohort-sessions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CourseCompletionModule } from '../course-completion/course-completion.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [PrismaModule, CourseCompletionModule, CertificatesModule],
  providers: [CoursesService, CohortsExportService, CohortSessionsService],
  controllers: [CoursesController],
  exports: [CoursesService],
})
export class CoursesModule {}
