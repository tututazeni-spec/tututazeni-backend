import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AclService {
  constructor(private prisma: PrismaService) {}

  // Criar role
  createRole(name: string, description?: string) {
    return this.prisma.role.create({
      data: { name, description },
    });
  }

  // Criar permissão
  createPermission(
  roleId: number,
  name: string,
  action: string,
  subject: string,
) {
  return this.prisma.permission.create({
    data: {
      name,
      action,
      subject,
      role: { connect: { id: roleId } },
    },
  });
}

  // Atribuir role ao usuário
  assignRole(userId: number, roleId: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { roleId },
    });
  }

  // Verificar permissão
  async can(userId: number, action: string, subject: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: { permissions: true },
        },
      },
    });

    if (!user?.role) return false;

    return user.role.permissions.some(
      (p) => p.action === action && p.subject === subject,
    );
  }

  // Listar roles
  listRoles() {
    return this.prisma.role.findMany({
      include: { permissions: true },
    });
  }
}