// src/declarations/declaration-purpose.service.ts
//
// Fase E — catálogo de finalidades de declaração (DeclarationPurpose). Portado
// verbatim de document-declarations.service.ts (eliminado); não tem duplicação
// com WorkDeclarationService, por isso fica no módulo `declarations`.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeclarationPurposeDto } from './declarations.dto';

@Injectable()
export class DeclarationPurposeService {
  constructor(private readonly prisma: PrismaService) {}

  async createPurpose(dto: CreateDeclarationPurposeDto) {
    return this.prisma.declarationPurpose.create({
      data: { ...dto, active: dto.active ?? true },
    });
  }

  async getPurposes(activeOnly = true) {
    return this.prisma.read.declarationPurpose.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async updatePurpose(id: number, dto: Partial<CreateDeclarationPurposeDto>) {
    return this.prisma.declarationPurpose.update({ where: { id }, data: dto });
  }
}
