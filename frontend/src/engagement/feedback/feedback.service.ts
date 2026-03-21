import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  submit(data: any) {
    return this.prisma.courseFeedback.create({ data });
  }

  getByCourse(courseId: number) {
    return this.prisma.courseFeedback.findMany({
      where: { courseId },
    });
  }
}
