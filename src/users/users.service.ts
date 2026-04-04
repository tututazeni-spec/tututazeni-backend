import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, UpdateProfileDto, UserFilterDto } from './users.dto';
 
const USER_INCLUDE = {
  role: true, unit: true, department: true,
  position: true, profile: true, points: true,
};
 
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: UserFilterDto) {
    const { page = 1, limit = 20, search, unitId, departmentId, roleId, active } = filters;
    const skip = (page - 1) * limit;
 
    const where: any = {};
    if (search) where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
    if (unitId) where.unitId = unitId;
    if (departmentId) where.departmentId = departmentId;
    if (roleId) where.roleId = roleId;
    if (active !== undefined) where.active = active;
 
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where, skip, take: limit,
        include: USER_INCLUDE,
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
 
    const safe = data.map(({ password: _, ...u }) => u);
    return { data: safe, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        ...USER_INCLUDE,
        enrollments: { include: { course: true }, take: 10 },
        badgeAwards: { include: { badge: true } },
        userCompetencies: { include: { competency: true } },
        performance: { orderBy: { createdAt: 'desc' }, take: 5 },
        developmentPlans: { where: { status: 'ACTIVE' }, take: 3 },
      },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    const { password: _, ...safe } = user;
    return safe;
  }
 
  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email já registado');
    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { ...dto, password: hashed },
      include: USER_INCLUDE,
    });
    await this.prisma.userPoints.create({ data: { userId: user.id, points: 0 } });
    const { password: _, ...safe } = user;
    return safe;
  }
 
  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.update({
      where: { id }, data, include: USER_INCLUDE,
    });
    const { password: _, ...safe } = user;
    return safe;
  }
 
  async deactivate(id: number) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { active: false } });
  }
 
  async activate(id: number) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { active: true } });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Utilizador removido' };
  }
 
  async upsertProfile(userId: number, dto: UpdateProfileDto) {
    return this.prisma.profile.upsert({
      where: { userId },
      create: { userId, bio: dto.bio },
      update: { bio: dto.bio },
    });
  }
 
  async getUserStats(id: number) {
    const [enrollments, points, badges, competencies] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: id }, include: { course: true } }),
      this.prisma.userPoints.findUnique({ where: { userId: id } }),
      this.prisma.badgeAward.count({ where: { userId: id } }),
      this.prisma.userCompetency.count({ where: { userId: id } }),
    ]);
 
    const completed = enrollments.filter(e => e.status === 'CONCLUIDO').length;
    const inProgress = enrollments.filter(e => e.status === 'EM_ANDAMENTO').length;
 
    return {
      totalEnrollments: enrollments.length,
      completed, inProgress,
      points: points?.points ?? 0,
      badges, competencies,
      completionRate: enrollments.length ? Math.round((completed / enrollments.length) * 100) : 0,
    };
  }
 
  async bulkImport(users: CreateUserDto[]) {
    const results = await Promise.allSettled(users.map(u => this.create(u)));
    const success = results.filter(r => r.status === 'fulfilled').length;
    const errors = results.filter(r => r.status === 'rejected').length;
    return { success, errors, total: users.length };
  }
}
