import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AutomationService {
  constructor(private prisma: PrismaService) {}

  createRule(data: any) {
    return this.prisma.automationRule.create({ data });
  }

  findAll() {
    return this.prisma.automationRule.findMany();
  }
}
