import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIndicatorDto, CreateRecordDto, FilterIndicatorDto } from './dto';
import { AuditService } from '../common/services/audit.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ════════════════════════════════════════════════════
  // INDICADORES DE MONITORIA
  // ════════════════════════════════════════════════════

  async createIndicator(dto: CreateIndicatorDto, userId: number) {
    const existing = await this.prisma.monitoringIndicator.findUnique({
      where: { code: dto.code },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Código ${dto.code} já existe`);
    }
    const indicator = await this.prisma.monitoringIndicator.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit.logEntity(userId, 'CREATE', 'MonitoringIndicator', indicator.id, {
      code: dto.code,
    });
    return indicator;
  }

  async findAllIndicators(filters: FilterIndicatorDto) {
    const { page = 1, limit = 20, category } = filters;
    const where = {
      deletedAt: null,
      isActive: true,
      ...(category && { category }),
    };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.monitoringIndicator.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { records: true } } },
      }),
      this.prisma.read.monitoringIndicator.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }

  async addRecord(indicatorId: string, dto: CreateRecordDto, userId: number) {
    const indicator = await this.prisma.read.monitoringIndicator.findUnique({
      where: { id: indicatorId },
    });
    if (!indicator) throw new NotFoundException('Indicador não encontrado');

    const target = indicator.target;
    const variance = target != null ? dto.value - target : null;
    const variancePct =
      target != null && target !== 0
        ? Math.round(((dto.value - target) / target) * 1000) / 10
        : null;

    const record = await this.prisma.monitoringRecord.create({
      data: {
        indicatorId,
        value: dto.value,
        target,
        variance,
        variancePct,
        period: dto.period,
        date: dto.date ? new Date(dto.date) : new Date(),
        notes: dto.notes,
        recordedById: userId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'MonitoringRecord', record.id, {
      indicatorId,
      value: dto.value,
      period: dto.period,
    });
    return record;
  }

  async getIndicatorHistory(indicatorId: string) {
    const [indicator, records] = await Promise.all([
      this.prisma.read.monitoringIndicator.findUnique({
        where: { id: indicatorId },
      }),
      this.prisma.read.monitoringRecord.findMany({
        where: { indicatorId, deletedAt: null },
        orderBy: { date: 'asc' },
        include: { recordedBy: { select: { fullName: true } } },
      }),
    ]);
    if (!indicator) throw new NotFoundException('Indicador não encontrado');
    return { indicator, records };
  }

  // ════════════════════════════════════════════════════
  // DASHBOARD
  // ════════════════════════════════════════════════════

  async getDashboard() {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [activeIndicators, recordsThisMonth] = await Promise.all([
      this.prisma.read.monitoringIndicator.count({
        where: { isActive: true, deletedAt: null },
      }),
      this.prisma.read.monitoringRecord.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
    ]);
    return {
      monitoring: { activeIndicators, recordsThisMonth },
    };
  }
}
