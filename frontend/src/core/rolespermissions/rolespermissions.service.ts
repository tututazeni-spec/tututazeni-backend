import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesPermissionsService {
  constructor(private prisma: PrismaService) {}

  createRole(data: any) {
    return this.prisma.role.create({ data });
  }

  createPermission(data: any) {
    return this.prisma.permission.create({ data });
  }

  assignPermission(roleId: number, permissionId: number) {
    return this.prisma.rolePermission.create({
      data: { roleId, permissionId },
    });
  }
}
