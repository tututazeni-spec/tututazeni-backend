import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProcessStandardService {
  constructor(private prisma: PrismaService) {}

  // Criar novo processo padronizado
  createProcess(data: Prisma.ProcessStandardCreateInput) {
    return this.prisma.processStandard.create({ data });
  }

  // Listar todos os processos
  findAllProcesses() {
    return this.prisma.processStandard.findMany({
      include: { steps: true, owner: true },
    });
  }

  // Buscar processo específico
  findProcess(id: number) {
    return this.prisma.processStandard.findUnique({
      where: { id },
      include: { steps: true, owner: true },
    });
  }

  // Criar etapa de processo
  createStep(data: Prisma.ProcessStepCreateInput) {
    return this.prisma.processStep.create({ data });
  }

  // Atualizar etapa de processo
  updateStep(id: number, data: Prisma.ProcessStepUpdateInput) {
    return this.prisma.processStep.update({ where: { id }, data });
  }

  // Listar etapas de um processo
  findStepsByProcess(processId: number) {
    return this.prisma.processStep.findMany({
      where: { processId },
      include: { responsible: true },
      orderBy: { order: 'asc' },
    });
  }
}