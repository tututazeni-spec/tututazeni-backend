import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACADEMIC_ORDER, CEFR_ORDER } from './position-requirements.evaluator';
import {
  CreatePositionRequirementDto,
  UpdatePositionRequirementDto,
} from './position-requirements.dto';

type Category = 'ACADEMIC' | 'EXPERIENCE' | 'LANGUAGE' | 'CERTIFICATION';

function assertLevel(category: Category, level: string | undefined | null): void {
  if (level === undefined || level === null) return;
  if (category === 'ACADEMIC' && !(ACADEMIC_ORDER as readonly string[]).includes(level)) {
    throw new BadRequestException(`Nível académico inválido: ${level}`);
  }
  if (category === 'LANGUAGE' && !(CEFR_ORDER as readonly string[]).includes(level)) {
    throw new BadRequestException(`Nível de idioma inválido: ${level} (use A1–C2)`);
  }
}

@Injectable()
export class PositionRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  list(positionId: number) {
    return this.prisma.read.positionRequirement.findMany({
      where: { positionId },
      orderBy: [{ category: 'asc' }, { id: 'asc' }],
    });
  }

  async create(positionId: number, dto: CreatePositionRequirementDto) {
    const position = await this.prisma.read.position.findUnique({ where: { id: positionId } });
    if (!position) throw new NotFoundException('Cargo não encontrado');
    assertLevel(dto.category, dto.level);
    if (dto.category === 'EXPERIENCE' && dto.minYears === undefined) {
      throw new BadRequestException('Experiência exige minYears');
    }
    return this.prisma.positionRequirement.create({
      data: {
        positionId,
        category: dto.category,
        title: dto.title,
        level: dto.level ?? null,
        minYears: dto.minYears ?? null,
        mandatory: dto.mandatory ?? true,
        notes: dto.notes ?? null,
      },
    });
  }

  private async findOwned(positionId: number, reqId: number) {
    const existing = await this.prisma.read.positionRequirement.findFirst({
      where: { id: reqId, positionId },
    });
    if (!existing) throw new NotFoundException('Requisito não encontrado');
    return existing;
  }

  async update(positionId: number, reqId: number, dto: UpdatePositionRequirementDto) {
    const existing = await this.findOwned(positionId, reqId);
    assertLevel(existing.category as Category, dto.level);
    return this.prisma.positionRequirement.update({ where: { id: reqId }, data: dto });
  }

  async remove(positionId: number, reqId: number) {
    await this.findOwned(positionId, reqId);
    await this.prisma.positionRequirement.delete({ where: { id: reqId } });
    return { id: reqId, deleted: true };
  }
}
