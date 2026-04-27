// src/roles-permissions/roles-permissions.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreatePermissionRoleDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() permissionIds?: number[];
}
export class UpdateRoleDto extends PartialType(CreatePermissionRoleDto) {}

@Injectable()
export class RolesPermissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true, _count: { select: { users: true } } },
    });
    if (!r) throw new NotFoundException('Role não encontrado');
    return r;
  }

  async create(dto: CreatePermissionRoleDto) {
    const exists = await this.prisma.role.findFirst({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Nome de role já existe');
    const { permissionIds, ...data } = dto;
    return this.prisma.role.create({
      data: {
        ...data,
        permissions: permissionIds?.length ? { connect: permissionIds.map(id => ({ id })) } : undefined,
      },
      include: { permissions: true },
    });
  }

  async update(id: number, dto: UpdateRoleDto) {
    await this.findOne(id);
    const { permissionIds, ...data } = dto;
    return this.prisma.role.update({
      where: { id }, data: { ...data },
      include: { permissions: true },
    });
  }

  async assignToUser(userId: number, roleId: number) {
    await this.findOne(roleId);
    return this.prisma.user.update({
      where: { id: userId }, data: { roleId },
      include: { role: { include: { permissions: true } } },
    });
  }

  async remove(id: number) {
    const role = await this.findOne(id);
    if ((role._count as any).users > 0) throw new ConflictException('Role tem utilizadores atribuídos');
    await this.prisma.role.delete({ where: { id } });
    return { message: 'Role removido' };
  }
}
