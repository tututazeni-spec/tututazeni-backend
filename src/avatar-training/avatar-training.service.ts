// src/avatar-training/avatar-training.service.ts
// Fase 1 — Base: gestão dos avatares (instrutores virtuais).
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { AvatarTrainingIntegrationsService } from './avatar-training-integrations.service';
import { AvatarTrainingProvidersService } from './avatar-training-providers.service';
import {
  AvatarFilterDto,
  AvatarKnowledgeItemDto,
  AvatarTrainingAvatarStatus,
  CreateTrainingAvatarDto,
  UpdateTrainingAvatarDto,
} from './dto/avatar-training.dto';
import { parseJson } from './avatar-training.helpers';

type AvatarRow = Prisma.TrainingAvatarGetPayload<object>;
interface StoredKnowledgeItem {
  sourceType: string;
  sourceId: string;
  title: string;
}

@Injectable()
export class AvatarTrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrations: AvatarTrainingIntegrationsService,
    private readonly providers: AvatarTrainingProvidersService,
  ) {}

  private present(a: AvatarRow) {
    return {
      ...a,
      voiceConfig: parseJson<Record<string, unknown> | null>(a.voiceConfig, null),
      knowledgeBase: parseJson<StoredKnowledgeItem[]>(a.knowledgeBase, []),
    };
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
    const ids = [...new Set(rows.map(r => r.responsibleId).filter((v): v is number => v !== null))];
    const people = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullName: true },
        })
      : [];
    return rows.map(r => ({
      ...this.present(r),
      responsibleName: people.find(p => p.id === r.responsibleId)?.fullName ?? null,
    }));
  }

  async getAvatar(id: number) {
    const row = await this.prisma.trainingAvatar.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Avatar não encontrado');
    const responsible = row.responsibleId
      ? await this.prisma.user.findUnique({
          where: { id: row.responsibleId },
          select: { fullName: true },
        })
      : null;
    return { ...this.present(row), responsibleName: responsible?.fullName ?? null };
  }

  /** Valida cada fonte no módulo de origem e devolve a lista normalizada (com título). */
  private async resolveKnowledgeBase(items: AvatarKnowledgeItemDto[]): Promise<string> {
    const seen = new Set<string>();
    const out: StoredKnowledgeItem[] = [];
    for (const it of items) {
      const k = `${it.sourceType}:${it.sourceId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const title = await this.integrations.resolveSource(it.sourceType, it.sourceId);
      out.push({ sourceType: it.sourceType, sourceId: it.sourceId, title });
    }
    return JSON.stringify(out);
  }

  /** Histórico de criação, alterações, testes e (des)activação — vem do registo de auditoria. */
  async avatarHistory(id: number) {
    await this.getAvatar(id);
    const rows = await this.prisma.auditLog.findMany({
      where: { entity: 'TrainingAvatar', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, fullName: true } },
      },
    });
    return rows.map(r => ({
      id: r.id,
      action: r.action,
      at: r.createdAt,
      user: r.user,
      detail: parseJson<Record<string, unknown> | null>(r.metadata, null),
    }));
  }

  async createAvatar(userId: number, dto: CreateTrainingAvatarDto) {
    if (dto.responsibleId)
      await this.integrations.assertUserExists(dto.responsibleId, 'Responsável');
    const { voiceConfig, knowledgeBase, ...rest } = dto;
    const row = await this.prisma.trainingAvatar.create({
      data: {
        ...rest,
        voiceConfig: voiceConfig ? JSON.stringify(voiceConfig) : undefined,
        knowledgeBase: knowledgeBase?.length
          ? await this.resolveKnowledgeBase(knowledgeBase)
          : undefined,
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
    const { voiceConfig, knowledgeBase, ...rest } = dto;
    // Alterar voz/fornecedor invalida o último teste: tem de ser testado outra vez.
    const configChanged =
      voiceConfig !== undefined || dto.provider !== undefined || dto.providerModel !== undefined;
    const row = await this.prisma.trainingAvatar.update({
      where: { id },
      data: {
        ...rest,
        ...(voiceConfig !== undefined ? { voiceConfig: JSON.stringify(voiceConfig) } : {}),
        ...(knowledgeBase !== undefined
          ? { knowledgeBase: await this.resolveKnowledgeBase(knowledgeBase) }
          : {}),
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
   * Teste do avatar: valida a configuração, confirma o modo texto (alternativa
   * obrigatória à voz) e reporta o estado do fornecedor de voz (fase 5).
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
    const health = await this.providers.health();
    const server = health.providers.find(p => p.provider === 'ELEVENLABS');
    return {
      id,
      ok,
      checks,
      voiceProvider:
        server?.status === 'AVAILABLE'
          ? 'Voz do servidor disponível (com voz do navegador e modo texto como alternativa)'
          : 'Voz do navegador e modo texto (voz do servidor não disponível)',
    };
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
