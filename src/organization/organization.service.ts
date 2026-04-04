// src/organization/organization.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private prisma: PrismaService) {}

  async getOrgChart() {
    const units = await this.prisma.unit.findMany({
      include: {
        // 'department' is singular — Unit belongs to one Department
        department: {
          include: {
            users: {
              where: { active: true },
              // managerId does not exist on User in the schema
              select: { id: true, fullName: true, position: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return units;
  }

  async getStats() {
    const [units, depts, positions, totalStaff] = await Promise.all([
      this.prisma.unit.count(),
      this.prisma.department.count(),
      this.prisma.position.count(),
      this.prisma.user.count({ where: { active: true } }),
    ]);
    return { units, departments: depts, positions, totalStaff };
  }

  async getDepartmentDetails(departmentId: number) {
    return this.prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        users: {
          where: { active: true },
          include: { position: true, points: true },
        },
        _count: { select: { users: true } },
      },
    });
  }
}