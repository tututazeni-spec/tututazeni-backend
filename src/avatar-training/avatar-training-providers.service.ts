// src/avatar-training/avatar-training-providers.service.ts
// Fase 5 — voz e vídeo (docs/Avatar_Training.md §5, §15, §17).
// Princípios: a sessão funciona sempre por texto; as chaves dos fornecedores ficam
// só no backend (variáveis de ambiente, reutiliza a ELEVENLABS_* já usada na leitura
// de aulas); o consumo de voz/vídeo é medido à parte do AI-Tutor, com limites por
// tentativa e por mês; falhas devolvem 503 com alternativa por texto e ficam
// registadas como incidentes técnicos. Não há fornecedor de vídeo ligado: o vídeo/
// animação é opcional e as legendas com tempos estimados servem de sincronização.
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AvatarTrainingProviderService, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/decorators';
import { assertCanAccess } from '../common/authz/ownership';
import {
  CaptionsQueryDto,
  SetMediaPreferencesDto,
  SynthesizeSpeechDto,
  UpsertProviderConfigDto,
} from './dto/avatar-training.dto';
import { parseJson, parseSteps } from './avatar-training.helpers';

const ELEVENLABS = 'ELEVENLABS';
const BROWSER = 'BROWSER';
const TTS_TIMEOUT_MS = 15_000;
const MAX_TTS_CHARS = 4000;
/** Limite de caracteres sintetizados por tentativa quando não há configuração. */
const DEFAULT_UNIT_LIMIT_PER_ATTEMPT = 15_000;
const WORDS_PER_MINUTE = 150;
const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

export const VOICE_NOTICE =
  'A voz é sintetizada por IA. O microfone é opcional e só é usado se o activar; a sessão continua disponível por texto a qualquer momento.';

export interface CaptionCue {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
}

@Injectable()
export class AvatarTrainingProvidersService {
  private readonly logger = new Logger(AvatarTrainingProvidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Estado dos fornecedores (sem segredos) ─────────────────────────────────

  async health() {
    const configs = await this.prisma.avatarTrainingProviderConfig.findMany();
    const cfg = (provider: string, serviceType: AvatarTrainingProviderService) =>
      configs.find(c => c.provider === provider && c.serviceType === serviceType);
    const elevenConfigured = this.elevenConfigured();
    const elevenRow = cfg(ELEVENLABS, 'TTS');
    const elevenDisabled = elevenRow?.status === 'DISABLED';

    const lastIncident = await this.prisma.avatarTrainingUsage.findFirst({
      where: { success: false },
      orderBy: { createdAt: 'desc' },
      select: { provider: true, errorCode: true, createdAt: true },
    });

    return {
      textMode: { available: true },
      providers: [
        {
          provider: BROWSER,
          serviceType: 'TTS',
          status: 'AVAILABLE',
          note: 'Voz do navegador (sem custo, sem envio de texto a terceiros)',
        },
        {
          provider: BROWSER,
          serviceType: 'STT',
          status: 'AVAILABLE',
          note: 'Reconhecimento no navegador; opcional e iniciado pelo formando',
        },
        {
          provider: ELEVENLABS,
          serviceType: 'TTS',
          status: !elevenConfigured ? 'NOT_CONFIGURED' : elevenDisabled ? 'DISABLED' : 'AVAILABLE',
          costPerUnit: elevenRow?.costPerUnit ?? 0,
          unitLimitPerAttempt: elevenRow?.unitLimitPerAttempt ?? DEFAULT_UNIT_LIMIT_PER_ATTEMPT,
          monthlyCostLimit: elevenRow?.monthlyCostLimit ?? null,
        },
        {
          provider: 'NONE',
          serviceType: 'VIDEO',
          status: 'NOT_CONFIGURED',
          note: 'Sem fornecedor de vídeo/animação — a sala usa a imagem do avatar e legendas sincronizadas',
        },
      ],
      lastIncident,
    };
  }

  // ── Configuração por fornecedor (ADMIN/RH) ─────────────────────────────────

  async upsertConfig(
    userId: number,
    provider: string,
    serviceType: AvatarTrainingProviderService,
    dto: UpsertProviderConfigDto,
  ) {
    const key = provider.toUpperCase();
    const data = {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.costPerUnit !== undefined ? { costPerUnit: dto.costPerUnit } : {}),
      ...(dto.unitLimitPerAttempt !== undefined
        ? { unitLimitPerAttempt: dto.unitLimitPerAttempt }
        : {}),
      ...(dto.monthlyCostLimit !== undefined ? { monthlyCostLimit: dto.monthlyCostLimit } : {}),
      ...(dto.configuration !== undefined
        ? { configuration: JSON.stringify(dto.configuration) }
        : {}),
    };
    const row = await this.prisma.avatarTrainingProviderConfig.upsert({
      where: { provider_serviceType: { provider: key, serviceType } },
      create: { provider: key, serviceType, ...data },
      update: data,
    });
    await this.audit.log({
      userId,
      action: 'UPDATE',
      entity: 'AvatarTrainingProviderConfig',
      entityId: row.id,
      metadata: { provider: key, serviceType, fields: Object.keys(data) },
    });
    return { ...row, configuration: parseJson(row.configuration, null) };
  }

  // ── Preferências de voz da tentativa ───────────────────────────────────────

  async setMedia(user: CurrentUserData, attemptId: number, dto: SetMediaPreferencesDto) {
    const attempt = await this.loadAttempt(attemptId);
    assertCanAccess(attempt, attempt.userId, user, []);
    if (attempt.status !== 'IN_PROGRESS' && attempt.status !== 'PAUSED') {
      throw new ConflictException('A tentativa já não aceita alterações');
    }
    if (dto.voiceEnabled && !dto.acknowledgedNotice) {
      throw new ConflictException(
        'Confirme que leu o aviso de utilização de voz e serviços de IA antes de activar a voz',
      );
    }
    const textOnly = !dto.voiceEnabled;
    const captions = dto.captions ?? true;
    await this.prisma.$transaction(async tx => {
      await tx.avatarTrainingAttempt.update({ where: { id: attemptId }, data: { textOnly } });
      const last = await tx.avatarTrainingInteraction.aggregate({
        where: { attemptId },
        _max: { sequence: true },
      });
      await tx.avatarTrainingInteraction.create({
        data: {
          attemptId,
          sequence: (last._max.sequence ?? 0) + 1,
          interactionType: 'SYSTEM',
          content: textOnly ? 'Modo só texto' : 'Voz activada',
          metadata: JSON.stringify({ channel: 'MEDIA', textOnly, captions }),
        },
      });
    });
    await this.audit.log({
      userId: user.id,
      action: 'UPDATE',
      entity: 'AvatarTrainingAttempt',
      entityId: attemptId,
      metadata: { media: { textOnly, captions, noticeAcknowledged: !!dto.acknowledgedNotice } },
    });
    return {
      attemptId,
      textOnly,
      captions,
      notice: VOICE_NOTICE,
      ...(await this.engineFor(attempt)),
    };
  }

  // ── Legendas / sincronização ───────────────────────────────────────────────

  /** Texto + legendas com tempos estimados — suporta voz do navegador e alternativa à voz. */
  async captions(user: CurrentUserData, attemptId: number, q: CaptionsQueryDto) {
    const attempt = await this.loadAttempt(attemptId);
    assertCanAccess(attempt, attempt.userId, user, []);
    const { text, title } = await this.resolveText(attempt, q.stepKey, q.aiMessageId);
    const language = attempt.assignment.session.avatar?.language ?? 'pt';
    return {
      title,
      language,
      text,
      cues: this.buildCues(text),
      notice: VOICE_NOTICE,
      ...(await this.engineFor(attempt)),
    };
  }

  // ── Síntese de voz (proxy — chave fica no backend) ─────────────────────────

  async synthesize(user: CurrentUserData, attemptId: number, dto: SynthesizeSpeechDto) {
    const attempt = await this.loadAttempt(attemptId);
    assertCanAccess(attempt, attempt.userId, user, []);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        attempt.status === 'PAUSED'
          ? 'A sessão está em pausa — retome primeiro'
          : 'A tentativa já não aceita interacções',
      );
    }
    if (attempt.textOnly) {
      throw new ConflictException('A voz está desactivada nesta sessão (modo só texto)');
    }

    const { text } = await this.resolveText(attempt, dto.stepKey, dto.aiMessageId);
    const spoken = text.length > MAX_TTS_CHARS ? `${text.slice(0, MAX_TTS_CHARS)}…` : text;
    const config = await this.prisma.avatarTrainingProviderConfig.findUnique({
      where: { provider_serviceType: { provider: ELEVENLABS, serviceType: 'TTS' } },
    });
    const voiceId = this.resolveVoiceId(attempt.assignment.session.avatar?.voiceConfig);

    if (!this.elevenConfigured() || !voiceId || config?.status === 'DISABLED') {
      throw new ServiceUnavailableException({
        code: 'VOICE_UNAVAILABLE',
        fallback: 'TEXT',
        message: 'Voz do servidor indisponível — use a voz do navegador ou o modo texto.',
      });
    }
    await this.assertWithinLimits(attemptId, spoken.length, config);

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
    try {
      const settings = parseJson<Record<string, unknown>>(config?.configuration, {});
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Accept: 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
          },
          body: JSON.stringify({
            text: spoken,
            model_id:
              typeof settings.model === 'string' ? settings.model : 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 },
          }),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const audio = Buffer.from(await response.arrayBuffer());
      const latencyMs = Date.now() - started;
      await this.recordUsage({
        attemptId,
        userId: attempt.userId,
        provider: ELEVENLABS,
        serviceType: 'TTS',
        units: spoken.length,
        estimatedCost: spoken.length * (config?.costPerUnit ?? 0),
        success: true,
        latencyMs,
      });
      return audio;
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      this.logger.warn({
        userId: user.id,
        attemptId,
        action: 'AVATAR_TTS_ERROR',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha na síntese de voz — a sessão continua por texto',
      });
      await this.recordUsage({
        attemptId,
        userId: attempt.userId,
        provider: ELEVENLABS,
        serviceType: 'TTS',
        units: 0,
        estimatedCost: 0,
        success: false,
        errorCode: aborted ? 'TIMEOUT' : 'PROVIDER_ERROR',
        latencyMs: Date.now() - started,
      });
      throw new ServiceUnavailableException({
        code: aborted ? 'VOICE_TIMEOUT' : 'VOICE_FAILED',
        fallback: 'TEXT',
        message: 'Não foi possível gerar a voz. Pode continuar por texto.',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Consumo e custos (medidos à parte do AI-Tutor) ─────────────────────────

  async usageSummary(from?: string, to?: string) {
    const range: Prisma.AvatarTrainingUsageWhereInput = {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    };
    const [groups, incidents, attempts] = await Promise.all([
      this.prisma.avatarTrainingUsage.groupBy({
        by: ['provider', 'serviceType'],
        where: { ...range, success: true },
        _sum: { units: true, estimatedCost: true },
        _count: { _all: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.avatarTrainingUsage.groupBy({
        by: ['provider', 'serviceType', 'errorCode'],
        where: { ...range, success: false },
        _count: { _all: true },
      }),
      this.prisma.avatarTrainingUsage.findMany({
        where: { ...range, success: true, attemptId: { not: null } },
        distinct: ['attemptId'],
        select: { attemptId: true },
      }),
    ]);
    const totalCost = groups.reduce((n, g) => n + (g._sum.estimatedCost ?? 0), 0);
    return {
      period: { from: from ?? null, to: to ?? null },
      source: 'AvatarTrainingUsage',
      formula: 'custo estimado = unidades × tarifa configurada (sem tarifa => 0)',
      totalEstimatedCost: totalCost,
      sessionsWithVoice: attempts.length,
      costPerSession: attempts.length ? totalCost / attempts.length : null,
      byProvider: groups.map(g => ({
        provider: g.provider,
        serviceType: g.serviceType,
        requests: g._count._all,
        units: g._sum.units ?? 0,
        estimatedCost: g._sum.estimatedCost ?? 0,
        avgLatencyMs: g._avg.latencyMs === null ? null : Math.round(g._avg.latencyMs),
      })),
      incidents: incidents.map(i => ({
        provider: i.provider,
        serviceType: i.serviceType,
        errorCode: i.errorCode,
        count: i._count._all,
      })),
    };
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private elevenConfigured(): boolean {
    return !!process.env.ELEVENLABS_API_KEY;
  }

  /** voiceId do avatar (validado) com a voz por omissão do ambiente como alternativa. */
  private resolveVoiceId(voiceConfigRaw: string | null | undefined): string | null {
    const cfg = parseJson<{ voiceId?: unknown }>(voiceConfigRaw, {});
    if (typeof cfg.voiceId === 'string' && VOICE_ID_PATTERN.test(cfg.voiceId)) return cfg.voiceId;
    const fallback = process.env.ELEVENLABS_VOICE_ID ?? '';
    return VOICE_ID_PATTERN.test(fallback) ? fallback : null;
  }

  private async engineFor(attempt: {
    textOnly: boolean;
    assignment: { session: { avatar: { avatarType: string } | null } };
  }) {
    const server = this.elevenConfigured();
    const cfg = server
      ? await this.prisma.avatarTrainingProviderConfig.findUnique({
          where: { provider_serviceType: { provider: ELEVENLABS, serviceType: 'TTS' } },
          select: { status: true },
        })
      : null;
    const serverVoice = server && cfg?.status !== 'DISABLED';
    return {
      voiceEngine: attempt.textOnly ? 'TEXT' : serverVoice ? ELEVENLABS : BROWSER,
      serverVoiceAvailable: serverVoice,
      videoAvailable: false,
      avatarType: attempt.assignment.session.avatar?.avatarType ?? 'IMAGE',
    };
  }

  private async assertWithinLimits(
    attemptId: number,
    chars: number,
    config: {
      unitLimitPerAttempt: number | null;
      monthlyCostLimit: number | null;
      costPerUnit: number;
    } | null,
  ) {
    const limit = config?.unitLimitPerAttempt ?? DEFAULT_UNIT_LIMIT_PER_ATTEMPT;
    const used = await this.prisma.avatarTrainingUsage.aggregate({
      where: { attemptId, provider: ELEVENLABS, serviceType: 'TTS', success: true },
      _sum: { units: true },
    });
    if ((used._sum.units ?? 0) + chars > limit) {
      throw this.limitError(
        'Limite de voz sintetizada desta sessão atingido — continue por texto.',
      );
    }
    if (config?.monthlyCostLimit) {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const month = await this.prisma.avatarTrainingUsage.aggregate({
        where: { provider: ELEVENLABS, success: true, createdAt: { gte: start } },
        _sum: { estimatedCost: true },
      });
      if ((month._sum.estimatedCost ?? 0) + chars * config.costPerUnit > config.monthlyCostLimit) {
        throw this.limitError('O orçamento mensal de voz foi atingido — continue por texto.');
      }
    }
  }

  private limitError(message: string) {
    return new HttpException(
      { code: 'VOICE_LIMIT_REACHED', fallback: 'TEXT', message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async recordUsage(data: Prisma.AvatarTrainingUsageUncheckedCreateInput) {
    // Falhar a registar consumo nunca pode bloquear a sessão.
    await this.prisma.avatarTrainingUsage.create({ data }).catch(err =>
      this.logger.warn({
        action: 'AVATAR_USAGE_RECORD_FAILED',
        err: { message: err instanceof Error ? err.message : String(err) },
      }),
    );
  }

  private async loadAttempt(id: number) {
    const attempt = await this.prisma.avatarTrainingAttempt.findUnique({
      where: { id },
      include: {
        assignment: {
          include: {
            session: {
              select: {
                title: true,
                contentConfig: true,
                avatar: { select: { language: true, voiceConfig: true, avatarType: true } },
              },
            },
          },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');
    return attempt;
  }

  /**
   * Só se lê em voz texto já autorizado: conteúdo de uma etapa da sessão ou uma
   * resposta do AI-Tutor desta mesma tentativa — nunca texto arbitrário (evita
   * usar a sala como proxy de síntese e consumir orçamento).
   */
  private async resolveText(
    attempt: Awaited<ReturnType<AvatarTrainingProvidersService['loadAttempt']>>,
    stepKey?: string,
    aiMessageId?: number,
  ): Promise<{ text: string; title: string }> {
    if (aiMessageId) {
      const linked = await this.prisma.avatarTrainingInteraction.findFirst({
        where: { attemptId: attempt.id, metadata: { contains: `"aiMessageId":${aiMessageId}` } },
        select: { id: true },
      });
      const message = linked
        ? await this.prisma.aiMessage.findFirst({
            where: { id: aiMessageId, role: 'ASSISTANT', session: { userId: attempt.userId } },
            select: { content: true },
          })
        : null;
      if (!message) throw new NotFoundException('Resposta do AI-Tutor não encontrada');
      return { text: message.content, title: 'Resposta do AI-Tutor' };
    }
    const steps = parseSteps(attempt.assignment.session.contentConfig);
    const step = stepKey ? steps.find(s => s.key === stepKey) : steps[attempt.currentStep];
    if (!step) throw new NotFoundException('Etapa não encontrada');
    const text = [step.title, step.content].filter(Boolean).join('. ');
    if (!text.trim()) throw new NotFoundException('A etapa não tem texto para ler');
    return { text, title: step.title };
  }

  /** Tempos estimados (palavras ÷ ritmo de leitura) para legendas sincronizadas. */
  private buildCues(text: string): CaptionCue[] {
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?…])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
    let cursor = 0;
    return sentences.map((sentence, index) => {
      const words = sentence.split(' ').length;
      const duration = Math.max(800, Math.round((words / WORDS_PER_MINUTE) * 60_000));
      const cue = { index, text: sentence, startMs: cursor, endMs: cursor + duration };
      cursor += duration;
      return cue;
    });
  }
}
