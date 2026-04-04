import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInstructorProfileDto, UpdateInstructorProfileDto,
  CreateMarketplaceCourseDto, InstructorReviewDto, InstructorFilterDto,
} from './instructor.dto';
 
@Injectable()
export class InstructorService {
  constructor(private prisma: PrismaService) {}
 
  // ─── PROFILES ─────────────────────────────────────────────────────────────
 
  async findAll(filters: InstructorFilterDto) {
    const { page = 1, limit = 20, approved, search } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (approved !== undefined) where.approved = approved;
    if (search) where.user = { fullName: { contains: search, mode: 'insensitive' } };
 
    const [data, total] = await Promise.all([
      this.prisma.instructorProfile.findMany({
        where, skip, take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          _count: { select: { reviews: true, marketplaceCourses: true } },
        },
        orderBy: { ratingAverage: 'desc' },
      }),
      this.prisma.instructorProfile.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const profile = await this.prisma.instructorProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        reviews: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        marketplaceCourses: true,
        payouts: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!profile) throw new NotFoundException('Perfil de instrutor não encontrado');
    return profile;
  }
 
  async findByUser(userId: number) {
    const profile = await this.prisma.instructorProfile.findUnique({
      where: { userId },
      include: {
        reviews: true,
        marketplaceCourses: true,
        _count: { select: { courses: true } },
      },
    });
    if (!profile) throw new NotFoundException('Instrutor não encontrado');
    return profile;
  }
 
  async createProfile(userId: number, dto: CreateInstructorProfileDto) {
    const exists = await this.prisma.instructorProfile.findUnique({ where: { userId } });
    if (exists) throw new ConflictException('Perfil de instrutor já existe');
    return this.prisma.instructorProfile.create({
      data: { userId, ...dto },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }
 
  async updateProfile(userId: number, dto: UpdateInstructorProfileDto) {
    await this.findByUser(userId);
    return this.prisma.instructorProfile.update({
      where: { userId }, data: dto,
    });
  }
 
  async approve(id: number) {
    return this.prisma.instructorProfile.update({
      where: { id }, data: { approved: true },
    });
  }
 
  async revoke(id: number) {
    return this.prisma.instructorProfile.update({
      where: { id }, data: { approved: false },
    });
  }
 
  // ─── REVIEWS ─────────────────────────────────────────────────────────────
 
  async addReview(userId: number, dto: InstructorReviewDto) {
    const review = await this.prisma.instructorReview.upsert({
      where: { instructorId_userId: { instructorId: dto.instructorId, userId } },
      create: { instructorId: dto.instructorId, userId, rating: dto.rating, comment: dto.comment },
      update: { rating: dto.rating, comment: dto.comment },
    });
 
    const avg = await this.prisma.instructorReview.aggregate({
      where: { instructorId: dto.instructorId }, _avg: { rating: true },
    });
    await this.prisma.instructorProfile.update({
      where: { id: dto.instructorId },
      data: { ratingAverage: avg._avg.rating ?? 0 },
    });
 
    return review;
  }
 
  // ─── MARKETPLACE COURSES ─────────────────────────────────────────────────
 
  async createMarketplaceCourse(userId: number, dto: CreateMarketplaceCourseDto) {
    const profile = await this.findByUser(userId);
    const course = await this.prisma.marketplaceCourse.create({
      data: { title: dto.title, price: dto.price, instructorId: profile.id },
    });
    await this.prisma.instructorCourse.create({
      data: { instructorId: profile.id, marketplaceCourseId: course.id },
    });
    await this.prisma.instructorProfile.update({
      where: { id: profile.id },
      data: { totalCourses: { increment: 1 } },
    });
    return course;
  }
 
  async getMarketplaceCourses(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.marketplaceCourse.findMany({
        skip, take: limit,
        include: { instructor: { include: { user: { select: { id: true, fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.marketplaceCourse.count(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  // ─── PAYOUTS ─────────────────────────────────────────────────────────────
 
  async createPayout(instructorId: number, amount: number) {
    return this.prisma.instructorPayout.create({
      data: { instructorId, amount },
    });
  }
 
  async getPayoutHistory(userId: number) {
    const profile = await this.findByUser(userId);
    return this.prisma.instructorPayout.findMany({
      where: { instructorId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
 
