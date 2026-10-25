import { toJson } from '../common/helpers/prisma-json';
// src/roi-impact/roi-evaluation-model.service.ts
// "Modelos de Avaliação" (docs/roi-impact.md §4) — CRUD da biblioteca de
// metodologias (Kirkpatrick/Phillips/personalizado) usadas para medir
// impacto/ROI. O modelo Kirkpatrick+Phillips por omissão é semeado em
// prisma/seed.ts (não aqui) — mesmo padrão de leaveTypeConfig — para nunca
// ser recriado silenciosamente por um pedido de leitura.
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRoiEvaluationModelDto,
  UpdateRoiEvaluationModelDto,
  RoiModelStatus,
} from './roi-impact.dto';

@Injectable()
export class RoiEvaluationModelService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(status?: RoiModelStatus) {
    return this.prisma.read.roiEvaluationModel.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: number) {
    const model = await this.prisma.read.roiEvaluationModel.findUnique({ where: { id } });
    if (!model) throw new NotFoundException(`Modelo de avaliação ${id} não encontrado`);
    return model;
  }

  async create(dto: CreateRoiEvaluationModelDto, createdById: number) {
    return this.prisma.roiEvaluationModel.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        levels: toJson(dto.levels),
        applicability: dto.applicability ? toJson(dto.applicability) : undefined,
        createdById,
      },
    });
  }

  async update(id: number, dto: UpdateRoiEvaluationModelDto) {
    await this.findOne(id);
    return this.prisma.roiEvaluationModel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.levels !== undefined ? { levels: toJson(dto.levels) } : {}),
        ...(dto.applicability !== undefined ? { applicability: toJson(dto.applicability) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }
}
