import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type AttendanceStatus = 'present' | 'absent' | 'late';

@Injectable()
export class DashboardRhService {
  constructor(private prisma: PrismaService) {}

  // EMPLOYEES
  async getAllEmployees() {
    return this.prisma.employee.findMany({
      include: { contracts: true, evaluations: true, attendances: true },
    });
  }

  async getEmployeeById(id: string) {
    const idNum = Number(id);
    return this.prisma.employee.findUnique({
      where: { id: idNum },
      include: { contracts: true, evaluations: true, attendances: true },
    });
  }

  // CONTRACTS
  async getActiveContracts() {
    const now = new Date();
    return this.prisma.contract.findMany({
      where: { endDate: { gte: now }, status: 'active' },
      include: { employee: true },
    });
  }

  async getContractsExpiringSoon(days = 30) {
    const now = new Date();
    const soon = new Date();
    soon.setDate(now.getDate() + days);

    return this.prisma.contract.findMany({
      where: {
        endDate: { gte: now, lte: soon },
        status: 'active',
      },
      include: { employee: true },
    });
  }

  // EVALUATIONS
  async getEvaluationsForEmployee(employeeId: string) {
    const employeeIdNum = Number(employeeId);
    return this.prisma.evaluation.findMany({
      where: { employeeId: employeeIdNum },
    });
  }

  async getAverageEvaluation(employeeId: string) {
    const employeeIdNum = Number(employeeId);
    const evaluations = await this.prisma.evaluation.findMany({
      where: { employeeId: employeeIdNum },
    });

    if (evaluations.length === 0) return null;

    const total = evaluations.reduce((sum, e) => sum + e.score, 0);
    return total / evaluations.length;
  }

  // ATTENDANCE
  async getAttendanceForEmployee(employeeId: string) {
    const employeeIdNum = Number(employeeId);
    return this.prisma.attendance.findMany({
      where: { employeeId: employeeIdNum },
    });
  }

  async getAttendanceSummary(employeeId: string) {
    const employeeIdNum = Number(employeeId);

    const attendance = await this.prisma.attendance.findMany({
      where: { employeeId: employeeIdNum },
    });

    const summary: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
    };

    attendance.forEach((a) => {
      const status = a.status as AttendanceStatus;
      summary[status]++;
    });

    return summary;
  }

  // DASHBOARD METRICS
  async getDashboardSummary() {
    const totalEmployees = await this.prisma.employee.count();

    const activeContracts = await this.prisma.contract.count({
      where: { status: 'active' },
    });

    const avgScore = await this.prisma.evaluation.aggregate({
      _avg: { score: true },
    });

    return {
      totalEmployees,
      activeContracts,
      averageScore: avgScore._avg.score || 0,
    };
  }
}