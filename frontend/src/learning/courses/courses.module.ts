import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  providers: [CoursesService],
  controllers: [CoursesController],
})
export class CoursesModule {}

