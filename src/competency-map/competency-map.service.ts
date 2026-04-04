import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompetencyMapDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsInt() competencyId!: number;
  @ApiProperty() @IsInt() currentLevel!: number;
  @ApiProperty() @IsInt() targetLevel!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() assessedById?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

interface CompetencyTotal {
  name: string;
  avgCurrent: number;
  avgTarget: number;
  count: number;
  sumCurrent: number;
  sumTarget: number;
}

@Injectable()
export class CompetencyMapService {
  constructor(private prisma: PrismaService) {}

  async getMap(userId: number) {
    const mappings = await this.prisma.competencyMap.findMany({
      where: { userId },
      include: { competency: true },
      orderBy: { competency: { name: 'asc' } },
    });
    const gaps = mappings.filter(m => m.targetLevel > m.currentLevel);
    return { userId, mappings, gapCount: gaps.length, gaps };
  }

  async getDepartmentMap(departmentId: number) {
    const users = await this.prisma.user.findMany({
      where: { departmentId, active: true },
      include: {
        // FIX: campo correcto é userCompetencies, não competencies
        competencyMaps: { include: { competency: true } },
        position: true,
      },
    });
    const totals: Record<string, CompetencyTotal> = {};
    for (const user of users) {
      for (const uc of user.competencyMaps) {
        const cname = uc.competency.name;
        if (!totals[cname]) {
          totals[cname] = {
            name: cname, avgCurrent: 0, avgTarget: 0,
            count: 0, sumCurrent: 0, sumTarget: 0,
          };
        }
        totals[cname].count++;
        totals[cname].sumCurrent += uc.currentLevel;
        totals[cname].sumTarget += uc.targetLevel;
      }
    }
    const summary = Object.values(totals).map(c => ({
      ...c,
      avgCurrent: +(c.sumCurrent / c.count).toFixed(1),
      avgTarget:  +(c.sumTarget  / c.count).toFixed(1),
      gap: +((c.sumTarget - c.sumCurrent) / c.count).toFixed(1),
    }));
    return { departmentId, totalUsers: users.length, summary };
  }

  async upsert(dto: CreateCompetencyMapDto) {
    return this.prisma.competencyMap.upsert({
      where: {
        userId_competencyId: {
          userId: dto.userId,
          competencyId: dto.competencyId,
        },
      },
      create: {
        userId:       dto.userId,
        competencyId: dto.competencyId,
        currentLevel: dto.currentLevel,
        targetLevel:  dto.targetLevel,
        assessedById: dto.assessedById,
        notes:        dto.notes,
        assessedAt:   new Date(),
      },
      update: {
        currentLevel: dto.currentLevel,
        targetLevel:  dto.targetLevel,
        assessedById: dto.assessedById,
        notes:        dto.notes,
        assessedAt:   new Date(),
      },
      include: { competency: true },
    });
  }

  async getGapAnalysis(departmentId?: number) {
    const where: any = {};
    if (departmentId) where.user = { departmentId };
    const mappings = await this.prisma.competencyMap.findMany({
      where,
      include: {
        competency: true,
        user: {
          select: {
            id: true, fullName: true,
            department: { select: { name: true } },
          },
        },
      },
    });
    const withGaps = mappings
      .filter(m => m.targetLevel > m.currentLevel)
      .map(m => ({
        user:         m.user,
        competency:   m.competency,
        currentLevel: m.currentLevel,
        targetLevel:  m.targetLevel,
        gap:          m.targetLevel - m.currentLevel,
      }))
      .sort((a, b) => b.gap - a.gap);
    return { totalGaps: withGaps.length, gaps: withGaps };
  }
}