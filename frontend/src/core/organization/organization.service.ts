import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private prisma: PrismaService) {}

  createDepartment(data: any) {
    return this.prisma.department.create({ data });
  }

  createUnit(data: any) {
    return this.prisma.unit.create({ data });
  }
}
