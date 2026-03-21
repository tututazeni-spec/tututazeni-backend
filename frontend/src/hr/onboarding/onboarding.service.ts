import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

  createPlan(data: any) {
    return this.prisma.onboardingPlan.create({ data });
  }

  findAll() {
    return this.prisma.onboardingPlan.findMany();
  }
}
