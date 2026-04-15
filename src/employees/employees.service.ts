// ─── employees.service.ts ─────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEmployeeDto, UpdateEmployeeDto, CreateContractDto,
  CreateEmployeeAttendanceDto, CreateFeedback360Dto, CreateEmployeeCareerPlanDto, EmployeeFilterDto,
} from './employees.dto';
 
@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: EmployeeFilterDto) {
    const { page = 1, limit = 20, search, role } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
    if (role) where.role = { contains: role, mode: 'insensitive' };
 
    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where, skip, take: limit,
        include: { _count: { select: { contracts: true, evaluations: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const e = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        contracts: { orderBy: { startDate: 'desc' } },
        evaluations: { orderBy: { evaluatedAt: 'desc' }, take: 5 },
        feedbacks: { orderBy: { evaluatedAt: 'desc' }, take: 5 },
        careerPlans: { orderBy: { createdAt: 'desc' } },
        attendances: { orderBy: { date: 'desc' }, take: 30 },
      },
    });
    if (!e) throw new NotFoundException('Colaborador não encontrado');
    return e;
  }
 
  async create(dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: { ...dto, joinedAt: new Date(dto.joinedAt) },
    });
  }
 
  async update(id: number, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.joinedAt) data.joinedAt = new Date(dto.joinedAt);
    return this.prisma.employee.update({ where: { id }, data });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.employee.delete({ where: { id } });
    return { message: 'Colaborador removido' };
  }
 
  // CONTRACTS
  async createContract(dto: CreateContractDto) {
    return this.prisma.contract.create({
      data: {
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
    });
  }
 
  async getContracts(employeeId: number) {
    return this.prisma.contract.findMany({
      where: { employeeId }, orderBy: { startDate: 'desc' },
    });
  }
 
  async updateContractStatus(id: number, status: string) {
    return this.prisma.contract.update({ where: { id }, data: { status } });
  }
 
  // ATTENDANCE
  async logAttendance(dto: CreateEmployeeAttendanceDto) {
    return this.prisma.attendance.create({
      data: { ...dto, date: new Date(dto.date) },
    });
  }
 
  async getAttendance(employeeId: number, from?: string, to?: string) {
    const where: any = { employeeId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    const records = await this.prisma.attendance.findMany({
      where, orderBy: { date: 'desc' },
    });
    const totalHours = records.reduce((acc, r) => acc + r.hoursWorked, 0);
    const avgHours = records.length ? +(totalHours / records.length).toFixed(2) : 0;
    return { records, totalHours, avgHours, totalDays: records.length };
  }
 
  // FEEDBACK 360
  async addFeedback360(dto: CreateFeedback360Dto) {
    return this.prisma.feedback360.create({
      data: { ...dto, evaluatedAt: new Date(dto.evaluatedAt) },
    });
  }
 
  async getFeedback360(employeeId: number) {
    const feedbacks = await this.prisma.feedback360.findMany({
      where: { employeeId }, orderBy: { evaluatedAt: 'desc' },
    });
    const avg = feedbacks.length
      ? +(feedbacks.reduce((acc, f) => acc + f.score, 0) / feedbacks.length).toFixed(2)
      : 0;
    return { feedbacks, averageScore: avg, total: feedbacks.length };
  }
 
  // CAREER PLANS
  async createCareerPlan(dto: CreateEmployeeCareerPlanDto) {
    return this.prisma.careerPlan.create({
      data: {
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
    });
  }
 
  async getCareerPlans(employeeId: number) {
    return this.prisma.careerPlan.findMany({
      where: { employeeId }, orderBy: { createdAt: 'desc' },
    });
  }
 
  async updateCareerPlanStatus(id: number, status: string) {
    return this.prisma.careerPlan.update({ where: { id }, data: { status } });
  }
 
  async getEmployeeStats(id: number) {
    const [contracts, feedbacks, careerPlans, attendances] = await Promise.all([
      this.prisma.contract.count({ where: { employeeId: id } }),
      this.prisma.feedback360.aggregate({
        where: { employeeId: id }, _avg: { score: true }, _count: true,
      }),
      this.prisma.careerPlan.count({ where: { employeeId: id, status: 'active' } }),
      this.prisma.attendance.aggregate({
        where: { employeeId: id }, _sum: { hoursWorked: true }, _avg: { hoursWorked: true },
      }),
    ]);
    return {
      totalContracts: contracts,
      avgFeedbackScore: feedbacks._avg.score ?? 0,
      totalFeedbacks: feedbacks._count,
      activeCareerPlans: careerPlans,
      totalHoursWorked: attendances._sum.hoursWorked ?? 0,
      avgDailyHours: attendances._avg.hoursWorked ?? 0,
    };
  }
}
 
