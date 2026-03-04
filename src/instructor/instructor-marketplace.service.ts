import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstructorMarketplaceService {
  constructor(private prisma: PrismaService) {}

  async createProfile(userId: number, expertiseArea: string, bio?: string) {
    return this.prisma.instructorProfile.create({
      data: {
        userId,
        expertiseArea,
        bio,
      },
    });
  }

  async approveInstructor(profileId: number) {
    return this.prisma.instructorProfile.update({
      where: { id: profileId },
      data: { approved: true },
    });
  }

  async linkCourse(instructorId: number, marketplaceCourseId: number) {
    return this.prisma.instructorCourse.create({
      data: {
        instructorId,
        marketplaceCourseId: marketplaceCourseId.toString(),
      },
    });
  }

  async reviewInstructor(
    instructorId: number,
    userId: number,
    rating: number,
    comment?: string,
  ) {
    return this.prisma.instructorReview.create({
      data: {
        instructorId,
        userId,
        rating,
        comment: comment ?? '',
      },
    });
  }

  async registerPayout(instructorId: number, amount: number, reference?: string) {
    return this.prisma.instructorPayout.create({
      data: {
        instructorId,
        amount,
      },
    });
  }

  async listApprovedInstructors() {
    return this.prisma.instructorProfile.findMany({
      where: { approved: true },
      include: {
        user: true,
      },
    });
  }
}