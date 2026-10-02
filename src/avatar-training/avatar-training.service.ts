// src/avatar-training/avatar-training.service.ts
// Fase 1 — Base: gestão dos avatares (instrutores virtuais).
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { AvatarTrainingIntegrationsService } from './avatar-training-integrations.service';
import {
  AvatarFilterDto,
  AvatarTrainingAvatarStatus,
  CreateTrainingAvatarDto,
  UpdateTrainingAvatarDto,
} from './dto/avatar-training.dto';
import { parseJson } from './avatar-training.helpers';

type AvatarRow = Prisma.TrainingAvatarGetPayload<object>;

@Injectable()
export class AvatarTrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: AvatarTrainingIntegrationsService,
  ) {}

  private present(a: AvatarRow) {
    return { ...a, voiceConfig: parseJson<Record<string, unknown> | null>(a.voiceConfig, null) };
  }

  async listAvatars(filters: AvatarFilterDto, activeOnly: boolean) {
    const where: Prisma.TrainingAvatarWhereInput = {
      status: activeOnly ? 'ACTIVE' : (filters.status ?? { not: 'ARCHIVED' }),
      ...(filters.language ? { language: filters.language } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
    };
    const rows = await this.prisma.trainingAvatar.findMany({ where, orderBy: { name: 'asc' } });
    return rows.map(r => this.present(r));
  }

  async getAvatar(id: number) {
    const row = await this.prisma.trainingAvatar.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Avatar não encontrado');
    return this.present(row);
  }

  async createAvatar(userId: number, dto: CreateTrainingAvatarDto) {
    if (dto.responsibleId)
      await this.integrations.assertUserExists(dto.responsibleId, 'Responsável');
    const { voiceConfig, ...rest } = dto;
    const row = await this.prisma.trainingAvatar.create({
      data: {
        ...rest,
        voiceConfig: voiceConfig ? JSON.stringify(voiceConfig) : undefined,
        createdById: userId,
        responsibleId: dto.responsibleId ?? userId,
      },
    });
    await this.audit.log({ userId, action: 'CREATE', entity: 'TrainingAvatar', entityId: row.id });
    return this.present(row);
  }

  async updateAvatar(userId: number, id: number, dto: UpdateTrainingAvatarDto) {
    const current = await this.getAvatar(id);
    if (current.status === 'ARCHIVED')
      throw new ConflictException('Avatar arquivado não pode ser editado');
    if (dto.responsibleId)
      await this.integrations.assertUserExists(dto.responsibleId, 'Responsável');
    const { voiceConfig, ...rest } = dto;
    // Alterar voz/fornecedor invalida o último teste: tem de ser testado outra vez.
    const configChanged =
      voiceConfig !== undefined || dto.provider !== undefined || dto.providerModel !== undefined;
    const row = await this.prisma.trainingAvatar.update({
      where: { id },
      data: {
        ...rest,
        ...(voiceConfig !== undefined ? { voiceConfig: JSON.stringify(voiceConfig) } : {}),
        ...(configChanged ? { lastTestedAt: null } : {}),
      },
    });
    await this.audit.log({
      userId,
      action: 'UPDATE',
      entity: 'TrainingAvatar',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return this.present(row);
  }

  /**
   * Teste do avatar: o serviço de voz/vídeo só é ligado na fase 5, por isso o teste
   * valida a configuração e confirma o modo texto (alternativa obrigatória à voz).
   */
  async testAvatar(userId: number, id: number) {
    const avatar = await this.getAvatar(id);
    const checks = [
      { check: 'Nome e idioma definidos', ok: !!avatar.name && !!avatar.language },
      { check: 'Imagem configurada', ok: !!avatar.imageUrl },
      { check: 'Modo texto disponível', ok: true },
    ];
    const ok = checks.every(c => c.ok);
    if (ok) {
      await this.prisma.trainingAvatar.update({
        where: { id },
        data: { lastTestedAt: new Date() },
      });
    }
    await this.audit.log({
      userId,
      action: 'TEST',
      entity: 'TrainingAvatar',
      entityId: id,
      metadata: { ok },
    });
    return { id, ok, checks, voiceProvider: 'Não ligado (fase 5) — sessões funcionam por texto' };
  }

  async setStatus(userId: number, id: number, status: AvatarTrainingAvatarStatus) {
    const avatar = await this.getAvatar(id);
    if (avatar.status === status) return avatar;
    if (status === 'ACTIVE' && !avatar.lastTestedAt) {
      throw new ConflictException('O avatar tem de ser testado antes de ser activado');
    }
    const row = await this.prisma.trainingAvatar.update({
      where: { id },
      data: {
        status,
        deactivatedAt: status === 'INACTIVE' || status === 'ARCHIVED' ? new Date() : null,
      },
    });
    await this.audit.log({
      userId,
      action: 'UPDATE',
      entity: 'TrainingAvatar',
      entityId: id,
      metadata: { from: avatar.status, to: status },
    });
    return this.present(row);
  }
}
