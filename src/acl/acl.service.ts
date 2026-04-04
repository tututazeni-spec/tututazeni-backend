import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AclService {
  constructor(private prisma: PrismaService) {}

  async getUserPermissions(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: true } } },
    });
    return {
      userId,
      role: user?.role?.name,
      permissions: (user?.role as any)?.permissions?.map((p: any) => p.name) ?? [],
    };
  }

  async hasPermission(userId: number, permission: string): Promise<boolean> {
    const { permissions } = await this.getUserPermissions(userId);
    return permissions.includes(permission) || permissions.includes('*');
  }

  async getAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: { name: 'asc' } });
  }

  async getRolePermissions(roleId: number) {
    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
  }

  async assignPermissionToRole(roleId: number, permissionId: number) {
    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: { connect: { id: permissionId } } },
      include: { permissions: true },
    });
  }

  async revokePermissionFromRole(roleId: number, permissionId: number) {
    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: { disconnect: { id: permissionId } } },
      include: { permissions: true },
    });
  }

  // FIX: Permission requer action, subject e roleId — description não existe no schema
  async createPermission(
    name: string,
    action: string,
    subject: string,
    roleId: number,
  ) {
    return this.prisma.permission.create({
      data: { name, action, subject, roleId },
    });
  }
}