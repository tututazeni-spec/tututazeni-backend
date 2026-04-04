// src/work-declaration/work-declaration.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestDeclarationDto, DeclarationFilterDto } from './work-declaration.dto';

@Injectable()
export class WorkDeclarationService {
  constructor(private prisma: PrismaService) {}

  private parse(record: any): any {
    try { return JSON.parse(record.description ?? '{}'); } catch { return {}; }
  }

  private toDecl(record: any) {
    return { id: record.id, userId: record.userId, createdAt: record.createdAt, ...this.parse(record) };
  }

  private async getRecord(id: number) {
    const record = await this.prisma.historyRecord.findFirst({
      where: { id, action: 'WORK_DECLARATION' },
      include: {
        user: {
          select: {
            id: true, fullName: true, email: true,
            position: true, department: true,
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Declaração não encontrada');
    return record;
  }

  async findAll(filters: DeclarationFilterDto) {
    const { page = 1, limit = 20, userId, type, status } = filters;
    const skip = (page - 1) * limit;
    const where: any = { action: 'WORK_DECLARATION' };
    if (userId) where.userId = userId;
    const records = await this.prisma.historyRecord.findMany({
      where,
      include: {
        user: {
          select: {
            id: true, fullName: true, email: true,
            position: true, department: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    let data = records.map(r => this.toDecl(r));
    if (type)   data = data.filter(r => r.type === type);
    if (status) data = data.filter(r => r.status === status);
    const total = data.length;
    return { data: data.slice(skip, skip + limit), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const record = await this.getRecord(id);
    return { ...this.toDecl(record), user: record.user };
  }

  async request(userId: number, dto: RequestDeclarationDto) {
    const payload = JSON.stringify({
      type: dto.type,
      purpose: dto.purpose,
      addressedTo: dto.addressedTo,
      status: 'PENDING',
    });
    const record = await this.prisma.historyRecord.create({
      data: {
        userId,
        action: 'WORK_DECLARATION',
        entityType: 'WorkDeclaration',
        description: payload,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
    await this.prisma.notificationLog.create({
      data: {
        userId,
        type: 'DECLARATION_REQUESTED',
        message: `Pedido de ${dto.type} submetido e em processamento.`,
        success: true,
      },
    });
    return this.toDecl(record);
  }

  async generate(id: number) {
    const decl    = await this.findOne(id);
    const user    = decl.user as any;
    const content = this.buildDeclarationText(decl.type, user, decl.addressedTo, decl.purpose);
    const refNum  = `DEC-${Date.now()}`;
    const current = this.parse(await this.prisma.historyRecord.findFirst({ where: { id } }));
    const updated = await this.prisma.historyRecord.update({
      where: { id },
      data: {
        description: JSON.stringify({
          ...current,
          status: 'GENERATED',
          generatedAt: new Date().toISOString(),
          content,
          referenceNumber: refNum,
        }),
      },
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: decl.userId,
        type: 'DECLARATION_READY',
        message: `A sua declaração ${decl.type} está pronta para levantamento.`,
        success: true,
      },
    });
    return this.toDecl(updated);
  }

  async issue(id: number) {
    const decl    = await this.findOne(id);
    const current = this.parse(await this.prisma.historyRecord.findFirst({ where: { id } }));
    const updated = await this.prisma.historyRecord.update({
      where: { id },
      data: {
        description: JSON.stringify({
          ...current,
          status: 'ISSUED',
          issuedAt: new Date().toISOString(),
        }),
      },
    });
    return this.toDecl(updated);
  }

  async getMyDeclarations(userId: number) {
    const records = await this.prisma.historyRecord.findMany({
      where: { action: 'WORK_DECLARATION', userId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(r => this.toDecl(r));
  }

  private buildDeclarationText(
    type: string,
    user: any,
    addressedTo?: string,
    purpose?: string,
  ): string {
    const today = new Date().toLocaleDateString('pt-AO', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const posTitle    = user.position?.name ?? 'colaborador';
    const deptName    = user.department?.name ?? 'N/A';
    const addressLine = addressedTo ? `, junto de ${addressedTo}` : '';
    const purposeLine = purpose ? `Finalidade: ${purpose}\n\n` : '';
    return [
      'DECLARAÇÃO',
      '',
      `Para os devidos efeitos${addressLine}, declara-se que ${user.fullName}`,
      `é colaborador desta organização, exercendo as funções de ${posTitle}`,
      `no departamento de ${deptName}.`,
      '',
      purposeLine,
      `Benguela, ${today}`,
      '',
      'A Direcção de Recursos Humanos',
    ].join('\n');
  }
}