import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  // 📌 Registrar evento
  createRecord(data: Prisma.HistoryRecordCreateInput) {
    return this.prisma.historyRecord.create({ data });
  }

  // 📚 Histórico por usuário
  findByUser(userId: number) {
    return this.prisma.historyRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 🏢 Histórico por departamento
  findByDepartment(departmentId: number) {
    return this.prisma.historyRecord.findMany({
      where: {
        user: { departmentId },
      },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 📊 Histórico global
  findAll() {
    return this.prisma.historyRecord.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 🗑 Remover registro (caso necessário)
  delete(id: number) {
    return this.prisma.historyRecord.delete({
      where: { id },
    });
  }
}