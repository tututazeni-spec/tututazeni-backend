import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export class CreateDepartmentDto {
  name!: string;
}
export class CreateUnitDto {
  name!: string;
  tipo!: string;
  province?: string;
  departmentId?: number;
}
export class CreateRoleDto {
  name!: string;
  description?: string;
}
export class CreatePermissionDto {
  name!: string;
  action!: string;
  subject!: string;
  roleId!: number;
}
export class CreatePositionDto {
  name!: string;
  level?: string;
  department?: string;
}

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.department.findMany({
      include: {
        _count: { select: { users: true, units: true } },
        units: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const d = await this.prisma.department.findUnique({
      where: { id },
      include: {
        units: { include: { _count: { select: { users: true } } } },
        _count: { select: { users: true } },
      },
    });
    if (!d) throw new NotFoundException('Departamento não encontrado');
    return d;
  }

  async create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({ data: dto });
  }

  async update(id: number, dto: Partial<CreateDepartmentDto>) {
    await this.findOne(id);
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.department.delete({ where: { id } });
    return { message: 'Departamento removido' };
  }
}

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.unit.findMany({
      include: {
        department: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const u = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        department: true,
        users: { select: { id: true, fullName: true, email: true, active: true } },
      },
    });
    if (!u) throw new NotFoundException('Unidade não encontrada');
    return u;
  }

  async create(dto: CreateUnitDto) {
    return this.prisma.unit.create({ data: dto });
  }

  async update(id: number, dto: Partial<CreateUnitDto>) {
    await this.findOne(id);
    return this.prisma.unit.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.unit.delete({ where: { id } });
    return { message: 'Unidade removida' };
  }
}

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: true,
        _count: { select: { users: true } },
      },
    });
  }

  async findOne(id: number) {
    const r = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true, rolePermissions: { include: { permission: true } } },
    });
    if (!r) throw new NotFoundException('Role não encontrada');
    return r;
  }

  async create(dto: CreateRoleDto) {
    return this.prisma.role.create({ data: dto });
  }

  async update(id: number, dto: Partial<CreateRoleDto>) {
    await this.findOne(id);
    return this.prisma.role.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.role.delete({ where: { id } });
    return { message: 'Role removida' };
  }

  async addPermission(dto: CreatePermissionDto) {
    return this.prisma.permission.create({ data: dto });
  }

  async removePermission(permissionId: number) {
    await this.prisma.permission.delete({ where: { id: permissionId } });
    return { message: 'Permissão removida' };
  }

  async assignPermissionToRole(roleId: number, permissionId: number) {
    return this.prisma.rolePermission
      .upsert({
        where: { id: 0 },
        create: { roleId, permissionId },
        update: {},
      })
      .catch(() => this.prisma.rolePermission.create({ data: { roleId, permissionId } }));
  }

  async initDefaultRoles() {
    const roles = [
      { name: 'ADMIN',        description: 'Administrador do sistema' },
      { name: 'RH',           description: 'Recursos Humanos' },
      { name: 'LIDER',        description: 'Líder de equipa' },
      { name: 'COLABORADOR',  description: 'Colaborador' },
    ];
    const created = [];
    for (const r of roles) {
      const exists = await this.prisma.role.findUnique({ where: { name: r.name } });
      if (!exists) created.push(await this.prisma.role.create({ data: r }));
    }
    return { created: created.length, roles: created };
  }
}

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.position.findMany({
      include: { _count: { select: { users: true, successionPlans: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const p = await this.prisma.position.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, fullName: true, email: true } },
        successionPlans: { include: { candidate: { select: { id: true, fullName: true } } } },
      },
    });
    if (!p) throw new NotFoundException('Posição não encontrada');
    return p;
  }

  async create(dto: CreatePositionDto) {
    return this.prisma.position.create({ data: dto });
  }

  async update(id: number, dto: Partial<CreatePositionDto>) {
    await this.findOne(id);
    return this.prisma.position.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.position.delete({ where: { id } });
    return { message: 'Posição removida' };
  }
}

@Injectable()
export class CareersService {
  constructor(private prisma: PrismaService) {}

  async findAllPositions() {
    return this.prisma.careerPosition.findMany({
      include: {
        competencies: { include: { competency: true } },
        _count: { select: { users: true } },
      },
      orderBy: { level: 'asc' },
    });
  }

  async findOnePosition(id: number) {
    const p = await this.prisma.careerPosition.findUnique({
      where: { id },
      include: {
        competencies: { include: { competency: true } },
        users: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });
    if (!p) throw new NotFoundException('Posição de carreira não encontrada');
    return p;
  }

  async createPosition(dto: {
    title: string; description: string; level: string;
    competencies?: { competencyId: number; requiredLevel: number }[];
  }) {
    const { competencies, ...data } = dto;
    const position = await this.prisma.careerPosition.create({ data });
    if (competencies?.length) {
      await this.prisma.positionCompetency.createMany({
        data: competencies.map(c => ({ positionId: position.id, ...c })),
      });
    }
    return this.findOnePosition(position.id);
  }

  async getUserCareerHistory(userId: number) {
    return this.prisma.userCareer.findMany({
      where: { userId },
      include: { position: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  async assignCareerPosition(userId: number, positionId: number) {
    await this.prisma.userCareer.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date() },
    });
    return this.prisma.userCareer.create({
      data: { userId, positionId },
      include: { position: true },
    });
  }

  async getCareerLadder() {
    return this.prisma.careerPosition.findMany({
      include: {
        competencies: { include: { competency: true } },
        _count: { select: { users: true } },
      },
      orderBy: { level: 'asc' },
    });
  }
}