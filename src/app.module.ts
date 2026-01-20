import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { LeaderModule } from './leader/leader.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [UserModule],
})
export class AppModule {}

