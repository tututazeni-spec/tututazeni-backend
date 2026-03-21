import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiIntegrationService {
  constructor(private prisma: PrismaService) {}

  createIntegration(data: any) {
    return this.prisma.integrationConfig.create({ data });
  }

  findAll() {
    return this.prisma.integrationConfig.findMany();
  }
}
