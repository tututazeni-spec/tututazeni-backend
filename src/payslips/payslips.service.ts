// src/payslips/payslips.service.ts
//
// NOTE: The schema has no Payslip model.
// Payslips are stored as JSON inside HistoryRecord (action = 'PAYSLIP').
//
// To restore full DB-backed functionality, add to schema.prisma and run
// `npx prisma migrate dev`:
//
// model Payslip {
//   id              Int       @id @default(autoincrement())
//   userId          Int
//   period          String
//   status          String    @default("DRAFT")
//   baseSalary      Float
//   bonuses         Float?
//   allowances      Float?
//   overtime        Float?
//   incomeTax       Float?
//   socialSecurity  Float?
//   otherDeductions Float?
//   grossSalary     Float
//   totalDeductions Float
//   netSalary       Float
//   notes           String?   @db.Text
//   issuedAt        DateTime?
//   acknowledgedAt  DateTime?
//   createdAt       DateTime  @default(now())
//   user            User      @relation(fields: [userId], references: [id])
//   @@unique([userId, period])
// }

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayslipDto, UpdatePayslipDto, PayslipFilterDto } from './payslips.dto';

@Injectable()
export class PayslipsService {
  constructor(private prisma: PrismaService) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  private parse(record: any): any {
    try { return JSON.parse(record.description ?? '{}'); } catch { return {}; }
  }

  private toPayslip(record: any) {
    return { id: record.id, userId: record.userId, createdAt: record.createdAt, ...this.parse(record) };
  }

  private async getRecord(id: number) {
    const record = await this.prisma.historyRecord.findFirst({
      where: { id, action: 'PAYSLIP' },
      include: { user: { select: { id: true, fullName: true, email: true, position: true, department: true } } },
    });
    if (!record) throw new NotFoundException('Recibo não encontrado');
    return record;
  }

  private calcIRT(gross: number): number {
    if (gross <= 70000)  return 0;
    if (gross <= 100000) return (gross - 70000) * 0.07;
    if (gross <= 150000) return 2100  + (gross - 100000) * 0.11;
    if (gross <= 200000) return 7600  + (gross - 150000) * 0.14;
    if (gross <= 300000) return 14600 + (gross - 200000) * 0.17;
    if (gross <= 500000) return 31600 + (gross - 300000) * 0.21;
    return 73600 + (gross - 500000) * 0.25;
  }

  // ── Public methods ────────────────────────────────────────────────────────

  async findAll(filters: PayslipFilterDto) {
    const { page = 1, limit = 20, userId, period, status } = filters;
    const skip = (page - 1) * limit;

    const where: any = { action: 'PAYSLIP' };
    if (userId) where.userId = userId;

    const records = await this.prisma.historyRecord.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, position: true, department: true } } },
      orderBy: { createdAt: 'desc' },
    });

    let data = records.map(r => this.toPayslip(r));
    if (period) data = data.filter(r => r.period?.includes(period));
    if (status) data = data.filter(r => r.status === status);

    const total = data.length;
    const paginated = data.slice(skip, skip + limit);
    return { data: paginated, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const record = await this.getRecord(id);
    return this.toPayslip(record);
  }

  async create(dto: CreatePayslipDto) {
    const existing = await this.prisma.historyRecord.findFirst({
      where: { action: 'PAYSLIP', userId: dto.userId, description: { contains: `"period":"${dto.period}"` } },
    });
    if (existing) throw new ConflictException(`Recibo de ${dto.period} já existe`);

    const bonuses         = dto.bonuses         ?? 0;
    const allowances      = dto.allowances      ?? 0;
    const overtime        = dto.overtime        ?? 0;
    const incomeTax       = dto.incomeTax       ?? 0;
    const socialSecurity  = dto.socialSecurity  ?? 0;
    const otherDeductions = dto.otherDeductions ?? 0;
    const grossSalary     = dto.baseSalary + bonuses + allowances + overtime;
    const totalDeductions = incomeTax + socialSecurity + otherDeductions;
    const netSalary       = grossSalary - totalDeductions;

    const payload = JSON.stringify({
      ...dto, grossSalary, totalDeductions, netSalary, status: 'DRAFT',
    });

    const record = await this.prisma.historyRecord.create({
      data: { userId: dto.userId, action: 'PAYSLIP', entityType: 'Payslip', description: payload },
      include: { user: { select: { id: true, fullName: true } } },
    });
    return this.toPayslip(record);
  }

  async bulkCreate(period: string, userIds?: number[]) {
    const where: any = { active: true };
    if (userIds?.length) where.id = { in: userIds };
    const users = await this.prisma.user.findMany({ where, include: { position: true } });

    const created = [];
    for (const u of users) {
      const exists = await this.prisma.historyRecord.findFirst({
        where: { action: 'PAYSLIP', userId: u.id, description: { contains: `"period":"${period}"` } },
      });
      if (!exists) {
        const base = (u.position as any)?.baseSalary ?? 0;
        const irt  = this.calcIRT(base);
        const inss = base * 0.03;
        const net  = base - irt - inss;
        const payload = JSON.stringify({
          userId: u.id, period, baseSalary: base, grossSalary: base,
          incomeTax: irt, socialSecurity: inss,
          totalDeductions: irt + inss, netSalary: net, status: 'DRAFT',
        });
        const record = await this.prisma.historyRecord.create({
          data: { userId: u.id, action: 'PAYSLIP', entityType: 'Payslip', description: payload },
        });
        created.push(this.toPayslip(record));
      }
    }
    return { created: created.length, period };
  }

  async issue(id: number) {
    const record = await this.getRecord(id);
    const data   = this.parse(record);
    const updated = await this.prisma.historyRecord.update({
      where: { id },
      data: { description: JSON.stringify({ ...data, status: 'ISSUED', issuedAt: new Date().toISOString() }) },
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: record.userId,
        type: 'PAYSLIP_ISSUED',
        message: `O seu recibo de ${data.period} está disponível.`,
        success: true,
      },
    });
    return this.toPayslip(updated);
  }

  async acknowledge(id: number, userId: number) {
    const record = await this.getRecord(id);
    if (record.userId !== userId) throw new NotFoundException('Sem permissão');
    const data = this.parse(record);
    const updated = await this.prisma.historyRecord.update({
      where: { id },
      data: { description: JSON.stringify({ ...data, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() }) },
    });
    return this.toPayslip(updated);
  }

  async update(id: number, dto: UpdatePayslipDto) {
    const record  = await this.getRecord(id);
    const current = this.parse(record);

    const baseSalary      = dto.baseSalary      ?? current.baseSalary      ?? 0;
    const bonuses         = dto.bonuses         ?? current.bonuses         ?? 0;
    const allowances      = dto.allowances      ?? current.allowances      ?? 0;
    const overtime        = dto.overtime        ?? current.overtime        ?? 0;
    const incomeTax       = dto.incomeTax       ?? current.incomeTax       ?? 0;
    const socialSecurity  = dto.socialSecurity  ?? current.socialSecurity  ?? 0;
    const otherDeductions = dto.otherDeductions ?? current.otherDeductions ?? 0;
    const grossSalary     = baseSalary + bonuses + allowances + overtime;
    const totalDeductions = incomeTax + socialSecurity + otherDeductions;
    const netSalary       = grossSalary - totalDeductions;

    const updated = await this.prisma.historyRecord.update({
      where: { id },
      data: {
        description: JSON.stringify({
          ...current, ...dto,
          grossSalary, totalDeductions, netSalary,
        }),
      },
    });
    return this.toPayslip(updated);
  }

  async getMyPayslips(userId: number) {
    const records = await this.prisma.historyRecord.findMany({
      where: { action: 'PAYSLIP', userId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    return records.map(r => this.toPayslip(r));
  }
}