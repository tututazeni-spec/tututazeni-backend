import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

interface ProcessStepInput {
  order: number;
  title: string;
  description?: string;
  responsibleId: number;
}

export class CreateProcessDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [Object], description: 'Lista de passos do processo' })
  @IsArray() steps!: ProcessStepInput[];
}

export class UpdateProcessDto extends PartialType(CreateProcessDto) {}

@Injectable()
export class ProcessStandardService {
  constructor(private prisma: PrismaService) {}

  // FIX: aceita category opcional (ignorado se schema não tiver o campo)
  async findAll(category?: string) {
    const where: any = {};
    if (category) where.category = category;
    return this.prisma.processStandard.findMany({
      where,
      include: {
        steps: { orderBy: { order: 'asc' } },
        _count: { select: { steps: true } },
      },
      orderBy: { title: 'asc' },
    });
  }

  async findOne(id: number) {
    const p = await this.prisma.processStandard.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: { responsible: { select: { id: true, fullName: true } } },
        },
        owner: { select: { id: true, fullName: true } },
      },
    });
    if (!p) throw new NotFoundException('Processo não encontrado');
    return p;
  }

  async create(ownerId: number, dto: CreateProcessDto) {
    const { steps, ...data } = dto;
    return this.prisma.processStandard.create({
      data: {
        title: data.title,
        description: data.description,
        ownerId,
        steps: {
          create: steps.map(s => ({
            title: s.title,
            description: s.description,
            order: s.order,
            responsibleId: s.responsibleId,
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
  }

  async update(id: number, dto: UpdateProcessDto) {
    await this.findOne(id);
    const { steps, ...data } = dto;
    await this.prisma.processStandard.update({
      where: { id },
      data: {
        ...(data.title       && { title: data.title }),
        ...(data.description && { description: data.description }),
      },
    });
    if (steps?.length) {
      await this.prisma.processStep.deleteMany({ where: { processId: id } });
      await this.prisma.processStep.createMany({
        data: steps.map(s => ({
          processId: id,
          title: s.title,
          description: s.description,
          order: s.order,
          responsibleId: s.responsibleId,
        })),
      });
    }
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.processStandard.delete({ where: { id } });
  }

  // FIX: método startInstance adicionado
  async startInstance(processId: number, initiatedById: number, targetUserId: number) {
    const process = await this.findOne(processId);
    const instance = await this.prisma.processInstance.create({
      data: {
        processId,
        initiatedById,
        targetUserId,
        status: 'IN_PROGRESS',
        stepProgress: {
          create: process.steps.map(s => ({
            stepId: s.id,
            status: 'PENDING',
          })),
        },
      },
      include: {
        stepProgress: true,
        initiatedBy: { select: { id: true, fullName: true } },
        targetUser:  { select: { id: true, fullName: true } },
      },
    });
    return instance;
  }

  // FIX: método completeStep adicionado
  async completeStep(instanceId: number, stepId: number, completedById: number, notes?: string) {
    const step = await this.prisma.stepProgress.findUnique({
      where: { instanceId_stepId: { instanceId, stepId } },
    });
    if (!step) throw new NotFoundException('Passo não encontrado na instância');

    const updated = await this.prisma.stepProgress.update({
      where: { instanceId_stepId: { instanceId, stepId } },
      data: {
        status: 'COMPLETED',
        completedById,
        completedAt: new Date(),
        notes,
      },
    });

    // Verifica se todos os passos foram concluídos
    const pending = await this.prisma.stepProgress.count({
      where: { instanceId, status: { not: 'COMPLETED' } },
    });
    if (pending === 0) {
      await this.prisma.processInstance.update({
        where: { id: instanceId },
        data: { status: 'COMPLETED' },
      });
    }

    return updated;
  }
}