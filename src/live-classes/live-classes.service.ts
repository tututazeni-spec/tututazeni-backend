import { createHmac } from 'crypto';
import { sign } from 'jsonwebtoken';
import {
  Injectable,
  Logger,
  Optional,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Prisma,
  LiveClassStatus,
  LiveClassRecurrence,
  LiveClassType,
  LiveClassEnrollmentMode,
  SessionModality,
  LiveAttendanceStatus,
  MeetingProvider,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/decorators';
import {
  assertCanManageCourse,
  ensureOwnInstructorProfile,
  isExternalInstructor,
  omitForExternal,
  ownInstructorProfileId,
} from '../common/authz/external-scope';
import { ZoomService } from './zoom.service';
import { CourseCompletionService } from '../course-completion/course-completion.service';
import {
  CreateLiveClassDto,
  UpdateLiveClassDto,
  LiveChatMessageDto,
  PostClassResponseDto,
  LiveClassFilterDto,
  PostponeLiveClassDto,
  CancelLiveClassDto,
  CreateLiveClassSessionDto,
  UpdateLiveClassSessionDto,
  RegisterAttendanceDto,
  BulkAttendanceDto,
  UpdateAttendanceDto,
  ParticipantsFilterDto,
  MaterialsFilterDto,
  EvaluationsFilterDto,
  LiveClassReportFilterDto,
} from './live-classes.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { normalizeMeeting } from './meeting-link.util';
import { notifyUsersSafe } from '../common/helpers/notification.helper';
import { buildCsvString } from '../common/utils/csv-export.util';

// Limite de segurança para a expansão de sessões recorrentes — evita um
// intervalo mal preenchido (ex.: recurrenceEndDate a 10 anos de distância)
// gerar milhares de linhas numa só criação.
const MAX_GENERATED_SESSIONS = 200;

const CLASS_INCLUDE = {
  course: { select: { id: true, title: true } },
  module: { select: { id: true, title: true } },
  lesson: { select: { id: true, title: true } },
  instructor: { select: { id: true, name: true, email: true } },
  coInstructor: { select: { id: true, name: true, email: true } },
  _count: { select: { attendances: true, messages: true, sessions: true } },
  postEvaluation: true,
} satisfies Prisma.LiveClassInclude;

/**
 * Campos do corpo que o instrutor externo não pode definir numa aula: quem a dá, a gravação
 * (publicar é ADMIN/RH) e os documentos da biblioteca da empresa.
 */
const EXTERNAL_LIVE_BLOCKED = [
  'instructorId',
  'coInstructorId',
  'recordingUrl',
  'recordingExpiresAt',
  'allowRecordingDownload',
  'recordingPublishedAt',
  'materialDocumentIds',
] as const;

@Injectable()
export class LiveClassesService {
  private readonly logger = new Logger(LiveClassesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly courseCompletion: CourseCompletionService,
    @Optional() private readonly zoom?: ZoomService,
  ) {}

  /**
   * Instrutor externo (fase 3): condição "aula em que sou instrutor/co-instrutor". Os métodos de
   * listagem recebem `ownerProfileId` (id do TrainingInstructorProfile do externo, ou -1 se ainda
   * não tem perfil) e juntam-na ao `where`; `undefined` = sem restrição (restantes papéis).
   */
  private ownClass(ownerProfileId?: number): Prisma.LiveClassWhereInput {
    return ownerProfileId === undefined
      ? {}
      : { OR: [{ instructorId: ownerProfileId }, { coInstructorId: ownerProfileId }] };
  }

  /** O externo vê o nome dos participantes, nunca o contacto/departamento. */
  private redactAttendeeForExternal<T extends { user?: unknown }>(row: T): T {
    const u = row.user as { id?: number; fullName?: string } | null | undefined;
    return { ...row, user: u ? { id: u.id, fullName: u.fullName } : u } as T;
  }

  /** Curso, módulo e lição indicados têm de ser de cursos onde o externo é instrutor. */
  private async assertExternalContentRefs(
    user: CurrentUserData,
    dto: { courseId?: number | null; moduleId?: number | null; lessonId?: number | null },
  ): Promise<void> {
    if (dto.courseId) await assertCanManageCourse(this.prisma, user, dto.courseId);
    if (dto.moduleId) {
      const mod = await this.prisma.courseModule.findUnique({
        where: { id: dto.moduleId },
        select: { courseId: true },
      });
      if (!mod) throw new NotFoundException('Recurso não encontrado');
      await assertCanManageCourse(this.prisma, user, mod.courseId);
    }
    if (dto.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: dto.lessonId },
        select: { module: { select: { courseId: true } } },
      });
      if (!lesson) throw new NotFoundException('Recurso não encontrado');
      await assertCanManageCourse(this.prisma, user, lesson.module.courseId);
    }
  }

  /** Resolve o âmbito do utilizador: `undefined` (sem restrição) ou o perfil do externo (-1 se não tem). */
  async ownerScope(user: CurrentUserData): Promise<number | undefined> {
    if (!isExternalInstructor(user)) return undefined;
    return (await ownInstructorProfileId(this.prisma, user)) ?? -1;
  }

  async findAll(filters: LiveClassFilterDto, ownerProfileId?: number) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.LiveClassWhereInput = {};
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.instructorId) where.instructorId = filters.instructorId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.modality) where.modality = filters.modality;
    if (filters.departmentId) where.targetDeptIds = { has: filters.departmentId };
    if (filters.unitId) where.targetUnitIds = { has: filters.unitId };
    if (filters.dateFrom || filters.dateTo) {
      where.scheduledAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }

    if (ownerProfileId !== undefined) where.AND = [this.ownClass(ownerProfileId)];

    const [data, total] = await Promise.all([
      this.prisma.read.liveClass.findMany({
        where,
        skip,
        take,
        include: CLASS_INCLUDE,
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.read.liveClass.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const lc = await this.prisma.read.liveClass.findUnique({
      where: { id },
      include: {
        ...CLASS_INCLUDE,
        attendances: { include: { user: { select: { id: true, fullName: true } } } },
        messages: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
        postEvaluation: { include: { responses: true } },
        sessions: {
          include: {
            instructor: { select: { id: true, name: true } },
            _count: { select: { attendances: true } },
          },
          orderBy: { seq: 'asc' },
        },
      },
    });
    if (!lc) throw new NotFoundException('Aula ao vivo não encontrada');
    return lc;
  }

  /**
   * Acesso à sala Jitsi. O nome é um HMAC do id com o JWT_SECRET (impossível de
   * adivinhar) e só é entregue a utilizadores autenticados. Se JITSI_APP_SECRET
   * estiver definido (JaaS ou Jitsi próprio com autenticação por token), emite
   * também um JWT por participante, de modo que a sala deixa de aceitar quem
   * apenas conheça o nome. Sem ele, mantém-se o meet.jit.si público.
   */
  async getRoomAccess(
    id: number,
    user: { id: number; email: string; fullName?: string | null; role?: { name: string } | null },
  ): Promise<
    | { roomName: string; domain: string; jwt?: string; appId?: string }
    | {
        provider: 'ZOOM' | 'TEAMS';
        joinUrl: string;
        passcode: string | null;
        /** Só Zoom com Meeting SDK configurado: permite embeber a reunião na página. */
        sdk?: {
          signature: string;
          sdkKey: string;
          meetingNumber: string;
          userName: string;
          userEmail: string;
        };
      }
  > {
    const lc = await this.prisma.read.liveClass.findUnique({
      where: { id },
      select: {
        id: true,
        meetingProvider: true,
        meetingUrl: true,
        meetingPasscode: true,
        zoomMeetingId: true,
      },
    });
    if (!lc) throw new NotFoundException('Aula ao vivo não encontrada');

    // Zoom/Teams: o organizador colou o link; o participante só o abre (estas
    // plataformas não se embebem em iframe). Sem JWT_SECRET nem sala Jitsi.
    if (lc.meetingProvider && lc.meetingProvider !== MeetingProvider.JITSI) {
      if (!lc.meetingUrl) {
        throw new ConflictException('A aula não tem link de reunião definido.');
      }
      const meetingNumber =
        lc.meetingProvider === MeetingProvider.ZOOM
          ? (lc.zoomMeetingId ?? lc.meetingUrl.match(/\/j\/(\d{9,11})/)?.[1] ?? null)
          : null;
      const sdk =
        meetingNumber && this.zoom?.isSdkConfigured()
          ? {
              ...this.zoom.buildSdkSignature(meetingNumber, 0),
              meetingNumber,
              userName: user.fullName || user.email,
              userEmail: user.email,
            }
          : undefined;
      return {
        provider: lc.meetingProvider,
        joinUrl: lc.meetingUrl,
        passcode: lc.meetingPasscode ?? null,
        ...(sdk ? { sdk } : {}),
      };
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET em falta — impossível gerar a sala');

    const digest = createHmac('sha256', secret).update(`jitsi-room:${id}`).digest('hex');
    const baseRoom = `innova-live-${id}-${digest.slice(0, 24)}`;
    const domain = process.env.JITSI_DOMAIN || 'meet.jit.si';
    const roleName = user.role?.name ?? '';
    // O externo só chega aqui para a sua própria aula (ExternalLiveClassScopeGuard).
    const moderator = ['ADMIN', 'RH', 'INSTRUCTOR', 'INSTRUCTOR_EXTERNO'].includes(roleName);
    const now = Math.floor(Date.now() / 1000);
    const displayName = user.fullName || user.email;

    // JaaS (8x8.vc): sala com prefixo `<appId>/`, JWT RS256 com `kid`, iss "chat"
    // e sub = appId. Activa-se com JITSI_PRIVATE_KEY (PEM) + JITSI_KEY_ID.
    const privateKey = process.env.JITSI_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const jaasAppId = process.env.JITSI_APP_ID;
    const keyId = process.env.JITSI_KEY_ID;
    if (privateKey && jaasAppId && keyId) {
      const roomName = `${jaasAppId}/${baseRoom}`;
      const jwt = sign(
        {
          aud: 'jitsi',
          iss: 'chat',
          sub: jaasAppId,
          room: baseRoom,
          iat: now,
          nbf: now - 5,
          exp: now + this.jitsiTokenTtlSeconds(),
          context: {
            user: { id: String(user.id), name: displayName, moderator },
            features: { recording: false, livestreaming: false, transcription: false },
          },
        },
        privateKey,
        { algorithm: 'RS256', keyid: keyId.includes('/') ? keyId : `${jaasAppId}/${keyId}` },
      );
      return { roomName, domain, jwt, appId: jaasAppId };
    }

    const roomName = baseRoom;
    const appSecret = process.env.JITSI_APP_SECRET;
    if (!appSecret) return { roomName, domain };

    const appId = process.env.JITSI_APP_ID || 'innova';
    const jwt = sign(
      {
        aud: 'jitsi',
        iss: appId,
        sub: process.env.JITSI_SUB || domain,
        room: roomName,
        iat: now,
        exp: now + this.jitsiTokenTtlSeconds(),
        context: {
          user: {
            id: String(user.id),
            name: user.fullName || user.email,
            moderator,
          },
        },
        moderator,
      },
      appSecret,
      { algorithm: 'HS256' },
    );
    return { roomName, domain, jwt };
  }

  /** Valida/normaliza a plataforma+link da aula. PRESENTIAL nunca usa reunião online. */
  private resolveMeeting(
    provider: MeetingProvider,
    rawUrl: string | null | undefined,
    modality?: SessionModality,
  ) {
    const effective = modality === SessionModality.PRESENTIAL ? MeetingProvider.JITSI : provider;
    const m = normalizeMeeting(effective, rawUrl);
    return {
      meetingProvider: effective,
      meetingUrl: m.url,
      ...(m.zoomId ? { zoomMeetingId: m.zoomId } : {}),
    };
  }

  /** Plataforma/link de uma sessão: sem plataforma, mantém-se só um link web simples. */
  private resolveSessionMeeting(dto: { meetingProvider?: MeetingProvider; meetingUrl?: string }) {
    if (dto.meetingProvider) {
      const m = normalizeMeeting(dto.meetingProvider, dto.meetingUrl);
      return { meetingProvider: dto.meetingProvider, meetingUrl: m.url };
    }
    if (dto.meetingUrl === undefined) return {};
    const url = dto.meetingUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      throw new BadRequestException('O link da reunião tem de começar por http:// ou https://.');
    }
    return { meetingUrl: url || null };
  }

  /** Validade do JWT da sala (omissão 2h; JITSI_JWT_TTL_MINUTES, entre 15 e 240). */
  private jitsiTokenTtlSeconds(): number {
    const minutes = Number(process.env.JITSI_JWT_TTL_MINUTES);
    const clamped =
      Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.max(minutes, 15), 240) : 120;
    return Math.round(clamped * 60);
  }

  private generateCode(type: string): string {
    return `${type.slice(0, 3)}-${Date.now().toString(36).toUpperCase()}`;
  }

  /** Expande a recorrência (etapa 2) em ocorrências LiveClassSession — a
   *  própria LiveClass continua a ser a 1ª ocorrência para `ONCE`, mantendo
   *  o fluxo de sala Jitsi/chat/presença ao nível da Aula inalterado. */
  private buildSessionDates(dto: CreateLiveClassDto, scheduledAt: Date): Date[] {
    if (!dto.recurrence || dto.recurrence === LiveClassRecurrence.ONCE) return [];
    if (!dto.recurrenceEndDate) {
      throw new BadRequestException('Recorrência exige recurrenceEndDate');
    }
    const end = new Date(dto.recurrenceEndDate);
    if (Number.isNaN(end.getTime()) || end < scheduledAt) {
      throw new BadRequestException('recurrenceEndDate inválida');
    }

    const dates: Date[] = [];
    const daysOfWeek = dto.recurrenceDaysOfWeek?.length ? new Set(dto.recurrenceDaysOfWeek) : null;
    const stepDays =
      dto.recurrence === LiveClassRecurrence.DAILY && !daysOfWeek ? 1 : daysOfWeek ? 1 : 7;

    const cursor = new Date(scheduledAt);
    while (cursor <= end) {
      if (!daysOfWeek || daysOfWeek.has(cursor.getDay())) {
        dates.push(new Date(cursor));
        if (dates.length > MAX_GENERATED_SESSIONS) {
          throw new BadRequestException(
            `Demasiadas sessões geradas (> ${MAX_GENERATED_SESSIONS}) — encurta o intervalo de recorrência.`,
          );
        }
      }
      cursor.setDate(cursor.getDate() + stepDays);
    }
    return dates;
  }

  /** Converte violações de restrição do Prisma (código repetido, curso/módulo/lição/formador
   *  inexistentes) em erros 4xx com mensagem útil, em vez de um 500 genérico. */
  private mapWriteError(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new ConflictException('Já existe uma aula com este código. Escolha outro código.');
      }
      if (e.code === 'P2003') {
        throw new BadRequestException(
          'Curso, módulo, lição ou formador inexistente. Escolha valores da lista.',
        );
      }
    }
    throw e;
  }

  /**
   * Zoom sem link/ID colado e com credenciais configuradas: cria a reunião via API
   * e devolve o link (e código de acesso) a guardar. Sem credenciais, mantém-se o
   * comportamento antigo (pede ao organizador que cole o link).
   */
  private async autoCreateZoom(
    provider: MeetingProvider,
    modality: SessionModality | undefined,
    rawUrl: string | null | undefined,
    topic: string,
    scheduledAt: Date,
    durationMinutes: number,
    timezone?: string,
  ): Promise<{ meetingUrl: string; passcode: string | null } | null> {
    if (provider !== MeetingProvider.ZOOM || modality === SessionModality.PRESENTIAL) return null;
    if ((rawUrl ?? '').trim() || !this.zoom?.isConfigured()) return null;
    const m = await this.zoom.createMeeting({
      topic,
      startTime: scheduledAt,
      durationMinutes,
      timezone,
    });
    return { meetingUrl: m.joinUrl, passcode: m.passcode };
  }

  async create(dto: CreateLiveClassDto, user?: CurrentUserData) {
    if (user && isExternalInstructor(user)) {
      // Instrutor externo: a aula é sempre dele (perfil criado na primeira aula); o co-instrutor e
      // o instrutor vindos do cliente são ignorados, e o curso/módulo/lição têm de ser seus.
      const profileId = await ensureOwnInstructorProfile(this.prisma, user);
      dto = { ...omitForExternal(user, dto, EXTERNAL_LIVE_BLOCKED), instructorId: profileId };
      await this.assertExternalContentRefs(user, dto);
    }
    const scheduledAt = new Date(dto.scheduledAt);
    const sessionDates = this.buildSessionDates(dto, scheduledAt);

    const { recurrenceEndDate, recurrenceDaysOfWeek, recordingExpiresAt, notifySettings, ...rest } =
      dto;
    const auto = await this.autoCreateZoom(
      dto.meetingProvider ?? MeetingProvider.JITSI,
      dto.modality,
      dto.meetingUrl,
      dto.topic,
      scheduledAt,
      dto.duration,
      dto.timezone,
    );
    const meeting = this.resolveMeeting(
      dto.meetingProvider ?? MeetingProvider.JITSI,
      auto?.meetingUrl ?? dto.meetingUrl,
      dto.modality,
    );

    const lc = await this.prisma.liveClass
      .create({
        data: {
          ...rest,
          ...meeting,
          meetingPasscode:
            meeting.meetingProvider === MeetingProvider.JITSI
              ? null
              : dto.meetingPasscode?.trim() || auto?.passcode || null,
          code: dto.code ?? this.generateCode(dto.type ?? 'AULA'),
          scheduledAt,
          recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
          recurrenceDaysOfWeek: recurrenceDaysOfWeek ?? [],
          recordingExpiresAt: recordingExpiresAt ? new Date(recordingExpiresAt) : undefined,
          notifySettings: notifySettings ?? undefined,
          sessions: sessionDates.length
            ? {
                create: sessionDates.map((sessionDate, i) => ({
                  seq: i + 1,
                  sessionDate,
                  durationMinutes: dto.duration,
                  instructorId: dto.instructorId,
                  location: dto.location,
                  meetingUrl: meeting.meetingUrl ?? dto.zoomMeetingId,
                  meetingProvider: meeting.meetingProvider,
                })),
              }
            : undefined,
        },
        include: CLASS_INCLUDE,
      })
      .catch((e: unknown) => this.mapWriteError(e));
    return lc;
  }

  async update(id: number, dto: UpdateLiveClassDto, user?: CurrentUserData) {
    if (user && isExternalInstructor(user)) {
      // O corpo não pode apontar a aula para fora do âmbito (curso/módulo/lição alheios, outro
      // instrutor, gravação ou documentos da biblioteca).
      dto = omitForExternal(user, dto, EXTERNAL_LIVE_BLOCKED);
      await this.assertExternalContentRefs(user, dto);
    }
    const current = await this.findOne(id);
    const { recurrenceEndDate, recordingExpiresAt, notifySettings, ...rest } = dto;
    const data: Prisma.LiveClassUpdateInput = { ...rest };
    if (
      dto.meetingProvider !== undefined ||
      dto.meetingUrl !== undefined ||
      dto.modality !== undefined
    ) {
      const provider = dto.meetingProvider ?? current.meetingProvider;
      const modality = dto.modality ?? current.modality;
      const rawUrl = dto.meetingUrl ?? current.meetingUrl;
      const auto = await this.autoCreateZoom(
        provider,
        modality,
        rawUrl,
        dto.topic ?? current.topic,
        dto.scheduledAt ? new Date(dto.scheduledAt) : current.scheduledAt,
        dto.duration ?? current.duration,
        dto.timezone ?? current.timezone ?? undefined,
      );
      const meeting = this.resolveMeeting(provider, auto?.meetingUrl ?? rawUrl, modality);
      Object.assign(data, meeting);
      if (meeting.meetingProvider === MeetingProvider.JITSI) data.meetingPasscode = null;
      else if (auto?.passcode && dto.meetingPasscode === undefined) {
        data.meetingPasscode = auto.passcode;
      }
    }
    if (dto.meetingPasscode !== undefined && data.meetingPasscode === undefined) {
      data.meetingPasscode = dto.meetingPasscode.trim() || null;
    }
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (recurrenceEndDate) data.recurrenceEndDate = new Date(recurrenceEndDate);
    if (recordingExpiresAt) data.recordingExpiresAt = new Date(recordingExpiresAt);
    if (notifySettings) data.notifySettings = notifySettings;
    const result = await this.prisma.liveClass
      .update({ where: { id }, data, include: CLASS_INCLUDE })
      .catch((e: unknown) => this.mapWriteError(e));
    if (dto.recordingUrl && !current.recordingUrl && current.recordingPublishedAt) {
      await this.notifyRecordingAvailable(id, null, dto.topic ?? current.topic);
    }
    return result;
  }

  /** Avisa quem foi adicionado à aula ao vivo (ou a uma sessão dela). */
  private async notifyAddedToLiveClass(
    userIds: number[],
    topic: string,
    liveClassId: number,
    sessionId: number | null,
  ) {
    await notifyUsersSafe(this.prisma, this.logger, {
      userIds,
      type: sessionId ? 'LIVE_CLASS_SESSION_ADDED' : 'LIVE_CLASS_ADDED',
      title: sessionId ? 'Adicionado a uma sessão' : 'Adicionado a uma aula ao vivo',
      message: sessionId
        ? `Foste adicionado a uma sessão da aula ao vivo "${topic}".`
        : `Foste adicionado à aula ao vivo "${topic}".`,
      category: 'LMS',
      metadata: { liveClassId, sessionId },
    });
  }

  /** Avisa quem participou (não ausente) na aula/sessão de que a gravação já está disponível. */
  private async notifyRecordingAvailable(
    liveClassId: number,
    sessionId: number | null,
    topic: string,
  ) {
    try {
      const attendees = await this.prisma.read.liveAttendance.findMany({
        where: {
          liveClassId,
          ...(sessionId ? { sessionId } : {}),
          status: { not: 'AUSENTE' },
          OR: [{ joinedAt: { not: null } }, { accumulatedSeconds: { gt: 0 } }],
        },
        select: { userId: true },
        distinct: ['userId'],
      });
      await notifyUsersSafe(this.prisma, this.logger, {
        userIds: attendees.map(a => a.userId),
        type: 'LIVE_CLASS_RECORDING_AVAILABLE',
        title: 'Gravação disponível',
        message: `A gravação da aula ao vivo "${topic}", em que participaste, já está disponível.`,
        category: 'LMS',
        metadata: { liveClassId, sessionId },
      });
    } catch (e: unknown) {
      this.logger.warn(
        `Falha ao notificar gravação da aula ao vivo ${liveClassId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.liveClass.delete({ where: { id } });
    return { message: 'Aula removida' };
  }

  // ─── Ações de ciclo de vida (secção 2 — "Ações") ──────────────────────────

  async start(id: number) {
    const lc = await this.findOne(id);
    if (lc.status === LiveClassStatus.CANCELADA || lc.status === LiveClassStatus.CONCLUIDA) {
      throw new ConflictException(`Não é possível iniciar uma aula com estado ${lc.status}`);
    }
    return this.prisma.liveClass.update({
      where: { id },
      data: { status: LiveClassStatus.EM_CURSO },
      include: CLASS_INCLUDE,
    });
  }

  async postpone(id: number, dto: PostponeLiveClassDto) {
    const lc = await this.findOne(id);
    const newDate = new Date(dto.scheduledAt);
    if (Number.isNaN(newDate.getTime())) throw new BadRequestException('Data inválida');
    return this.prisma.liveClass.update({
      where: { id },
      data: {
        status: LiveClassStatus.ADIADA,
        postponedFromAt: lc.scheduledAt,
        postponeReason: dto.reason,
        scheduledAt: newDate,
      },
      include: CLASS_INCLUDE,
    });
  }

  async cancel(id: number, dto: CancelLiveClassDto) {
    await this.findOne(id);
    return this.prisma.liveClass.update({
      where: { id },
      data: {
        status: LiveClassStatus.CANCELADA,
        cancelledAt: new Date(),
        cancellationReason: dto.reason,
      },
      include: CLASS_INCLUDE,
    });
  }

  async duplicate(id: number) {
    const lc = await this.findOne(id);
    return this.prisma.liveClass.create({
      data: {
        courseId: lc.courseId,
        topic: `${lc.topic} (cópia)`,
        code: this.generateCode(lc.type),
        description: lc.description,
        thumbnailUrl: lc.thumbnailUrl,
        type: lc.type,
        status: LiveClassStatus.AGENDADA,
        moduleId: lc.moduleId,
        lessonId: lc.lessonId,
        instructorId: lc.instructorId,
        coInstructorId: lc.coInstructorId,
        scheduledAt: lc.scheduledAt,
        duration: lc.duration,
        timezone: lc.timezone,
        recurrence: LiveClassRecurrence.ONCE,
        modality: lc.modality,
        zoomMeetingId: lc.zoomMeetingId,
        meetingProvider: lc.meetingProvider,
        meetingUrl: lc.meetingUrl,
        meetingPasscode: lc.meetingPasscode,
        location: lc.location,
        building: lc.building,
        room: lc.room,
        capacity: lc.capacity,
        enrollmentMode: lc.enrollmentMode,
        maxParticipants: lc.maxParticipants,
        waitlistEnabled: lc.waitlistEnabled,
        targetDeptIds: lc.targetDeptIds,
        targetUnitIds: lc.targetUnitIds,
        targetPositionIds: lc.targetPositionIds,
        objectives: lc.objectives,
        agenda: lc.agenda,
        topics: lc.topics,
        materialDocumentIds: lc.materialDocumentIds,
        attendanceAutoRegister: lc.attendanceAutoRegister,
        attendanceRequired: lc.attendanceRequired,
        minAttendancePercent: lc.minAttendancePercent,
        lateToleranceMinutes: lc.lateToleranceMinutes,
        recordSession: lc.recordSession,
        allowRecordingDownload: lc.allowRecordingDownload,
        evaluationRequired: lc.evaluationRequired,
        notifySettings: lc.notifySettings ?? undefined,
      },
      include: CLASS_INCLUDE,
    });
  }

  // ─── Sessões (secção 5) ────────────────────────────────────────────────────

  /** Todas as sessões de todas as aulas — tabela global da aba "Sessões". */
  async listAllSessions(filters: LiveClassFilterDto, ownerProfileId?: number) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.LiveClassSessionWhereInput = {};
    if (filters.instructorId) where.instructorId = filters.instructorId;
    if (filters.status) where.status = filters.status;
    if (filters.courseId) where.liveClass = { courseId: filters.courseId };
    if (filters.dateFrom || filters.dateTo) {
      where.sessionDate = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }

    if (ownerProfileId !== undefined) where.AND = [{ liveClass: this.ownClass(ownerProfileId) }];

    const [data, total] = await Promise.all([
      this.prisma.read.liveClassSession.findMany({
        where,
        skip,
        take,
        include: {
          instructor: { select: { id: true, name: true } },
          liveClass: {
            select: {
              id: true,
              topic: true,
              modality: true,
              course: { select: { id: true, title: true } },
            },
          },
          _count: { select: { attendances: true } },
        },
        orderBy: { sessionDate: 'desc' },
      }),
      this.prisma.read.liveClassSession.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async listSessions(liveClassId: number) {
    await this.findOne(liveClassId);
    return this.prisma.read.liveClassSession.findMany({
      where: { liveClassId },
      include: {
        instructor: { select: { id: true, name: true } },
        _count: { select: { attendances: true } },
      },
      orderBy: { seq: 'asc' },
    });
  }

  async createSession(liveClassId: number, dto: CreateLiveClassSessionDto) {
    await this.findOne(liveClassId);
    const last = await this.prisma.read.liveClassSession.findFirst({
      where: { liveClassId },
      orderBy: { seq: 'desc' },
    });
    return this.prisma.liveClassSession.create({
      data: {
        liveClassId,
        seq: (last?.seq ?? 0) + 1,
        sessionDate: new Date(dto.sessionDate),
        durationMinutes: dto.durationMinutes,
        instructorId: dto.instructorId,
        location: dto.location,
        ...this.resolveSessionMeeting(dto),
        notes: dto.notes,
        thumbnailUrl: dto.thumbnailUrl || null,
      },
      include: { instructor: { select: { id: true, name: true } } },
    });
  }

  async updateSession(liveClassId: number, sessionId: number, dto: UpdateLiveClassSessionDto) {
    const session = await this.prisma.read.liveClassSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.liveClassId !== liveClassId) {
      throw new NotFoundException('Sessão não encontrada');
    }
    const { sessionDate, meetingProvider: _p, meetingUrl: _u, ...rest } = dto;
    const updated = await this.prisma.liveClassSession.update({
      where: { id: sessionId },
      data: {
        ...rest,
        ...(dto.thumbnailUrl !== undefined ? { thumbnailUrl: dto.thumbnailUrl || null } : {}),
        ...this.resolveSessionMeeting(dto),
        ...(sessionDate ? { sessionDate: new Date(sessionDate) } : {}),
      },
      include: { instructor: { select: { id: true, name: true } } },
    });
    if (dto.recordingUrl && !session.recordingUrl && session.recordingPublishedAt) {
      const lc = await this.findOne(liveClassId);
      await this.notifyRecordingAvailable(liveClassId, sessionId, lc.topic);
    }
    return updated;
  }

  async deleteSession(liveClassId: number, sessionId: number) {
    const session = await this.prisma.read.liveClassSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.liveClassId !== liveClassId) {
      throw new NotFoundException('Sessão não encontrada');
    }
    await this.prisma.liveClassSession.delete({ where: { id: sessionId } });
    return { message: 'Sessão removida' };
  }

  // ─── Sala ao vivo (join/leave/chat) — inalterado, ao nível da Aula ────────

  // A presença regista-se sozinha ao entrar na sala. Em aulas recorrentes fica
  // ligada à sessão em curso (janela: 15 min antes do início até 30 min depois
  // do fim, ignorando as canceladas); fora de qualquer sessão — e nas aulas
  // únicas — fica ao nível da Aula (sessionId null). findFirst em vez de
  // findUnique pelo índice composto: nulls não são únicos em Postgres, por
  // isso é o próprio código que garante no máximo uma linha por
  // (aula, utilizador, sessão) — ver nota junto de @@unique em LiveAttendance.
  private async resolveActiveSessionId(liveClassId: number, now = new Date()) {
    const early = 15 * 60_000;
    const late = 30 * 60_000;
    const candidates = await this.prisma.read.liveClassSession.findMany({
      where: {
        liveClassId,
        status: { not: LiveClassStatus.CANCELADA },
        sessionDate: {
          gte: new Date(now.getTime() - 24 * 3_600_000 - late),
          lte: new Date(now.getTime() + early),
        },
      },
      select: { id: true, sessionDate: true, durationMinutes: true },
      orderBy: { sessionDate: 'desc' },
    });
    const current = candidates.find(c => {
      const start = c.sessionDate.getTime();
      return (
        now.getTime() >= start - early && now.getTime() <= start + c.durationMinutes * 60_000 + late
      );
    });
    return current?.id ?? null;
  }

  async joinClass(liveClassId: number, userId: number) {
    const sessionId = await this.resolveActiveSessionId(liveClassId);
    const existing = await this.prisma.liveAttendance.findFirst({
      where: { liveClassId, userId, sessionId },
    });
    const now = new Date();
    let attendance;
    if (existing) {
      // Reentrada: mantém a primeira entrada (para o cálculo de atraso) e
      // limpa a saída.
      attendance = await this.prisma.liveAttendance.update({
        where: { id: existing.id },
        data: {
          joinedAt: existing.joinedAt ?? now,
          leftAt: null,
          // Nova passagem: o tempo anterior mantém-se em accumulatedSeconds
          currentJoinedAt: existing.currentJoinedAt ?? now,
        },
      });
    } else {
      attendance = await this.prisma.liveAttendance.create({
        data: { liveClassId, userId, sessionId, joinedAt: now, currentJoinedAt: now },
      });
    }
    return attendance;
  }

  async leaveClass(liveClassId: number, userId: number) {
    // Fecha o registo aberto mais recente, seja da sessão ou da aula, e soma a
    // passagem que acabou ao tempo total (entrar de novo continua a somar).
    const open = await this.prisma.liveAttendance.findFirst({
      where: { liveClassId, userId, joinedAt: { not: null }, leftAt: null },
      orderBy: { joinedAt: 'desc' },
    });
    if (!open) throw new NotFoundException('Não está inscrito nesta aula');
    const now = new Date();
    const stintStart = open.currentJoinedAt ?? open.joinedAt!;
    const stintSeconds = Math.max(0, Math.floor((now.getTime() - stintStart.getTime()) / 1000));
    const attendance = await this.prisma.liveAttendance.update({
      where: { id: open.id },
      data: {
        leftAt: now,
        currentJoinedAt: null,
        accumulatedSeconds: open.accumulatedSeconds + stintSeconds,
      },
    });
    const lc = await this.findOne(liveClassId);
    await this.maybeSyncCourseProgress(
      lc,
      userId,
      attendance.status,
      attendance.joinedAt,
      attendance.leftAt,
      attendance,
    );
    return { ...attendance, ...this.deriveAttendance(attendance, lc) };
  }

  async sendMessage(liveClassId: number, userId: number, dto: LiveChatMessageDto) {
    return this.prisma.liveChatMessage.create({
      data: { liveClassId, userId, message: dto.message },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async getMessages(liveClassId: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    return this.prisma.read.liveChatMessage.findMany({
      where: { liveClassId },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    });
  }

  async createPostEvaluation(liveClassId: number) {
    const exists = await this.prisma.postClassEvaluation.findUnique({ where: { liveClassId } });
    if (exists) throw new ConflictException('Avaliação pós-aula já criada');
    return this.prisma.postClassEvaluation.create({
      data: { liveClassId },
    });
  }

  async submitPostResponse(userId: number, dto: PostClassResponseDto) {
    const evaluation = await this.prisma.read.postClassEvaluation.findUnique({
      where: { id: dto.evaluationId },
    });
    if (!evaluation) throw new NotFoundException('Avaliação não encontrada');

    const response = await this.prisma.postClassResponse.upsert({
      where: { evaluationId_userId: { evaluationId: dto.evaluationId, userId } },
      create: {
        evaluationId: dto.evaluationId,
        userId,
        rating: dto.rating,
        instructorRating: dto.instructorRating,
        contentRating: dto.contentRating,
        organizationRating: dto.organizationRating,
        applicabilityRating: dto.applicabilityRating,
        nps: dto.nps,
        feedback: dto.feedback,
      },
      update: {
        rating: dto.rating,
        instructorRating: dto.instructorRating,
        contentRating: dto.contentRating,
        organizationRating: dto.organizationRating,
        applicabilityRating: dto.applicabilityRating,
        nps: dto.nps,
        feedback: dto.feedback,
      },
    });

    const avg = await this.prisma.read.postClassResponse.aggregate({
      where: { evaluationId: dto.evaluationId },
      _avg: { rating: true },
    });
    await this.prisma.postClassEvaluation.update({
      where: { id: dto.evaluationId },
      data: { averageScore: avg._avg.rating ?? 0 },
    });

    return response;
  }

  // ─── Presenças (etapa 6 — regra dos 70%) ──────────────────────────────────

  /** Deriva duração/percentagem/estado a partir de joinedAt/leftAt — mesma
   *  regra dos 70% usada pelo relatório por aula e pelas tabelas globais de
   *  Participantes/Presenças (secções 6/10). `status` explícito (registo
   *  manual) tem sempre prioridade sobre o cálculo automático. */
  private deriveAttendance(
    a: {
      joinedAt: Date | null;
      leftAt: Date | null;
      status: LiveAttendanceStatus | null;
      accumulatedSeconds?: number | null;
      currentJoinedAt?: Date | null;
    },
    lc: {
      scheduledAt: Date;
      duration: number;
      minAttendancePercent: number;
      lateToleranceMinutes: number;
    },
  ) {
    // Tempo único = soma de todas as passagens (+ a que está em curso). Registos
    // manuais/antigos sem acumulado caem no intervalo entrada → saída.
    const openStint = a.currentJoinedAt
      ? Math.max(0, Math.floor((Date.now() - a.currentJoinedAt.getTime()) / 1000))
      : 0;
    const totalSeconds = (a.accumulatedSeconds ?? 0) + openStint;
    const durationMinutes =
      totalSeconds > 0
        ? Math.round(totalSeconds / 60)
        : a.joinedAt && a.leftAt
          ? Math.round((a.leftAt.getTime() - a.joinedAt.getTime()) / 60000)
          : null;
    const attendancePercent =
      durationMinutes !== null && lc.duration > 0
        ? Math.min(100, Math.round((durationMinutes / lc.duration) * 100))
        : null;

    let computedStatus: LiveAttendanceStatus = 'AUSENTE';
    if (!a.joinedAt) {
      computedStatus = 'AUSENTE';
    } else if (attendancePercent !== null) {
      const lateMin = Math.round((a.joinedAt.getTime() - lc.scheduledAt.getTime()) / 60000);
      if (attendancePercent >= lc.minAttendancePercent) {
        computedStatus = lateMin > lc.lateToleranceMinutes ? 'ATRASADO' : 'PRESENTE';
      } else if (attendancePercent > 0) {
        computedStatus = 'PARCIAL';
      }
    }
    return { durationMinutes, attendancePercent, computedStatus: a.status ?? computedStatus };
  }

  async getAttendanceReport(liveClassId: number, user?: CurrentUserData) {
    const lc = await this.findOne(liveClassId);
    const external = !!user && isExternalInstructor(user);
    const attendances = await this.prisma.read.liveAttendance.findMany({
      where: { liveClassId },
      include: {
        user: { select: { id: true, fullName: true, ...(external ? {} : { email: true }) } },
      },
    });
    return attendances.map(a => ({ ...a, ...this.deriveAttendance(a, lc) }));
  }

  // ─── Participantes (secção 6) / Presenças (secção 10) — tabela global ─────

  private readonly PARTICIPANT_INCLUDE = {
    user: {
      select: {
        id: true,
        fullName: true,
        email: true,
        employeeNumber: true,
        department: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
    },
    liveClass: {
      select: {
        id: true,
        topic: true,
        scheduledAt: true,
        duration: true,
        minAttendancePercent: true,
        lateToleranceMinutes: true,
        course: { select: { id: true, title: true } },
        postEvaluation: { select: { averageScore: true } },
      },
    },
    session: { select: { id: true, seq: true, sessionDate: true } },
  } satisfies Prisma.LiveAttendanceInclude;

  async listParticipants(filters: ParticipantsFilterDto, ownerProfileId?: number) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const userWhere: Prisma.UserWhereInput = {};
    // O externo não filtra por departamento/unidade nem procura por nº de colaborador.
    const external = ownerProfileId !== undefined;
    if (filters.departmentId && !external) userWhere.departmentId = filters.departmentId;
    if (filters.unitId && !external) userWhere.unitId = filters.unitId;
    if (filters.search) {
      userWhere.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        ...(external
          ? []
          : [{ employeeNumber: { contains: filters.search, mode: 'insensitive' as const } }]),
      ];
    }

    const liveClassWhere: Prisma.LiveClassWhereInput = {};
    if (filters.courseId) liveClassWhere.courseId = filters.courseId;
    if (filters.dateFrom || filters.dateTo) {
      liveClassWhere.scheduledAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }

    const where: Prisma.LiveAttendanceWhereInput = {};
    if (filters.liveClassId) where.liveClassId = filters.liveClassId;
    if (filters.sessionId) where.sessionId = filters.sessionId;
    if (ownerProfileId !== undefined) liveClassWhere.AND = [this.ownClass(ownerProfileId)];
    if (Object.keys(liveClassWhere).length) where.liveClass = liveClassWhere;
    if (Object.keys(userWhere).length) where.user = userWhere;

    const [rows, total] = await Promise.all([
      this.prisma.read.liveAttendance.findMany({
        where,
        skip,
        take,
        include: this.PARTICIPANT_INCLUDE,
        orderBy: { id: 'desc' },
      }),
      this.prisma.read.liveAttendance.count({ where }),
    ]);

    let data = rows.map(a => {
      const row = { ...a, ...this.deriveAttendance(a, a.liveClass) };
      return ownerProfileId === undefined ? row : this.redactAttendeeForExternal(row);
    });
    // status é derivado (não uma coluna filtrável directamente na query acima
    // porque pode vir de override manual) — filtra-se depois de calcular.
    if (filters.status) data = data.filter(a => a.computedStatus === filters.status);

    return buildPaginatedResponse(data, filters.status ? data.length : total, page, limit);
  }

  private async assertLiveAttendance(liveClassId: number, attendanceId: number) {
    const a = await this.prisma.read.liveAttendance.findUnique({ where: { id: attendanceId } });
    if (!a || a.liveClassId !== liveClassId) throw new NotFoundException('Presença não encontrada');
    return a;
  }

  /** "Adicionar" (secção 6) / registo manual de presença — RH/ADMIN/LIDER. */
  async registerAttendance(liveClassId: number, dto: RegisterAttendanceDto) {
    const lc = await this.findOne(liveClassId);
    if (dto.sessionId) {
      const session = await this.prisma.read.liveClassSession.findUnique({
        where: { id: dto.sessionId },
      });
      if (!session || session.liveClassId !== liveClassId) {
        throw new NotFoundException('Sessão não encontrada');
      }
    }
    const sessionId = dto.sessionId ?? null;
    const existing = await this.prisma.liveAttendance.findFirst({
      where: { liveClassId, userId: dto.userId, sessionId },
    });
    const data = {
      status: dto.status,
      joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : undefined,
      leftAt: dto.leftAt ? new Date(dto.leftAt) : undefined,
      justification: dto.justification,
      // Registo manual das horas prevalece sobre o tempo medido
      ...(dto.joinedAt || dto.leftAt ? { accumulatedSeconds: 0, currentJoinedAt: null } : {}),
    };
    const attendance = existing
      ? await this.prisma.liveAttendance.update({ where: { id: existing.id }, data })
      : await this.prisma.liveAttendance.create({
          data: { liveClassId, userId: dto.userId, sessionId, ...data },
        });
    if (!existing)
      await this.notifyAddedToLiveClass([dto.userId], lc.topic, liveClassId, sessionId);

    await this.maybeSyncCourseProgress(
      lc,
      dto.userId,
      attendance.status,
      attendance.joinedAt,
      attendance.leftAt,
    );
    return { ...attendance, ...this.deriveAttendance(attendance, lc) };
  }

  /**
   * Adicionar presenças em massa: por utilizadores, por departamentos ou todos
   * os colaboradores activos. Não duplica quem já está inscrito (mesma aula e
   * sessão); o estado fica por omissão, como no registo individual.
   */
  async bulkRegisterAttendance(
    liveClassId: number,
    dto: BulkAttendanceDto,
    user?: CurrentUserData,
  ) {
    if (user && isExternalInstructor(user) && (dto.all || dto.departmentIds?.length)) {
      // Inscrever departamentos inteiros ou "todos" é gestão de pessoas (RH/ADMIN).
      throw new ForbiddenException(
        'Apenas é possível adicionar participantes indicados individualmente',
      );
    }
    const lc = await this.findOne(liveClassId);
    if (dto.sessionId) {
      const session = await this.prisma.read.liveClassSession.findUnique({
        where: { id: dto.sessionId },
      });
      if (!session || session.liveClassId !== liveClassId) {
        throw new NotFoundException('Sessão não encontrada');
      }
    }
    const sessionId = dto.sessionId ?? null;
    const userIds = new Set<number>(dto.userIds ?? []);
    if (dto.all || dto.departmentIds?.length) {
      const users = await this.prisma.read.user.findMany({
        where: {
          accountStatus: 'ACTIVE',
          ...(dto.all ? {} : { departmentId: { in: dto.departmentIds } }),
        },
        select: { id: true },
      });
      users.forEach(u => userIds.add(u.id));
    }
    if (userIds.size === 0) {
      throw new BadRequestException('Nenhum colaborador encontrado para adicionar');
    }
    const existing = await this.prisma.liveAttendance.findMany({
      where: { liveClassId, sessionId, userId: { in: [...userIds] } },
      select: { userId: true },
    });
    const have = new Set(existing.map(e => e.userId));
    const toCreate = [...userIds].filter(id => !have.has(id));
    if (toCreate.length) {
      await this.prisma.liveAttendance.createMany({
        data: toCreate.map(userId => ({ liveClassId, userId, sessionId })),
      });
      await this.notifyAddedToLiveClass(toCreate, lc.topic, liveClassId, sessionId);
    }
    return { added: toCreate.length, alreadyPresent: have.size };
  }

  /** "Registar presença" / "Justificar ausência" (secções 2/6/10). */
  async updateAttendance(liveClassId: number, attendanceId: number, dto: UpdateAttendanceDto) {
    const lc = await this.findOne(liveClassId);
    await this.assertLiveAttendance(liveClassId, attendanceId);
    const attendance = await this.prisma.liveAttendance.update({
      where: { id: attendanceId },
      data: {
        status: dto.status,
        joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : undefined,
        leftAt: dto.leftAt ? new Date(dto.leftAt) : undefined,
        justification: dto.justification,
        ...(dto.joinedAt || dto.leftAt ? { accumulatedSeconds: 0, currentJoinedAt: null } : {}),
      },
    });
    await this.maybeSyncCourseProgress(
      lc,
      attendance.userId,
      attendance.status,
      attendance.joinedAt,
      attendance.leftAt,
    );
    return { ...attendance, ...this.deriveAttendance(attendance, lc) };
  }

  /** "Remover" participante (secção 6). */
  async removeAttendance(liveClassId: number, attendanceId: number) {
    await this.assertLiveAttendance(liveClassId, attendanceId);
    await this.prisma.liveAttendance.delete({ where: { id: attendanceId } });
    return { message: 'Participante removido' };
  }

  /**
   * Secção 10 — "alimentar automaticamente o progresso do curso": quando a
   * presença (explícita ou calculada) é PRESENTE/ATRASADO e a aula está
   * ligada a uma Lição (Etapa 1 — "Lição associada"), delega no orquestrador
   * único de progresso (CourseCompletionModule.markLessonComplete — ver
   * memory project_innova_course_completion_consolidation_faseA), em vez de
   * escrever LessonProgress directamente aqui. Best-effort: um utilizador
   * sem matrícula activa ou bloqueado por drip/pré-requisito não deve
   * impedir o registo da própria presença, por isso os erros são engolidos.
   */
  private async maybeSyncCourseProgress(
    lc: {
      lessonId: number | null;
      scheduledAt: Date;
      duration: number;
      minAttendancePercent: number;
      lateToleranceMinutes: number;
    },
    userId: number,
    status: LiveAttendanceStatus | null,
    joinedAt: Date | null,
    leftAt: Date | null,
    extra?: { accumulatedSeconds?: number | null; currentJoinedAt?: Date | null },
  ) {
    if (!lc.lessonId) return;
    const { computedStatus } = this.deriveAttendance({ joinedAt, leftAt, status, ...extra }, lc);
    if (computedStatus !== 'PRESENTE' && computedStatus !== 'ATRASADO') return;
    try {
      await this.courseCompletion.markLessonComplete(userId, lc.lessonId, {});
    } catch (e) {
      this.logger.warn(
        `Não foi possível sincronizar progresso do curso (lessonId=${lc.lessonId}, userId=${userId}): ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  // ─── Formadores (secção 7) — perfil partilhado com Trainings ──────────────

  async listInstructors(ownerProfileId?: number) {
    const classes = await this.prisma.read.liveClass.findMany({
      where:
        ownerProfileId === undefined
          ? { OR: [{ instructorId: { not: null } }, { coInstructorId: { not: null } }] }
          : this.ownClass(ownerProfileId),
      select: {
        instructorId: true,
        coInstructorId: true,
        status: true,
        duration: true,
        course: { select: { title: true } },
        postEvaluation: { select: { averageScore: true } },
        _count: { select: { attendances: true } },
      },
    });

    interface Agg {
      scheduled: number;
      completed: number;
      minutes: number;
      participants: number;
      scores: number[];
      courses: Set<string>;
    }
    const stats = new Map<number, Agg>();
    const touch = (id: number): Agg => {
      let s = stats.get(id);
      if (!s) {
        s = {
          scheduled: 0,
          completed: 0,
          minutes: 0,
          participants: 0,
          scores: [],
          courses: new Set(),
        };
        stats.set(id, s);
      }
      return s;
    };
    for (const c of classes) {
      for (const id of [c.instructorId, c.coInstructorId]) {
        if (!id) continue;
        const s = touch(id);
        if (c.status === 'AGENDADA' || c.status === 'EM_PREPARACAO') s.scheduled++;
        if (c.status === 'CONCLUIDA') {
          s.completed++;
          s.minutes += c.duration;
        }
        s.participants += c._count.attendances;
        if (c.postEvaluation?.averageScore) s.scores.push(c.postEvaluation.averageScore);
        if (c.course?.title) s.courses.add(c.course.title);
      }
    }

    const ids = [...stats.keys()];
    const profiles = ids.length
      ? await this.prisma.read.trainingInstructorProfile.findMany({
          where: { id: { in: ids } },
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        })
      : [];

    return profiles
      .map(p => {
        const s = stats.get(p.id);
        return {
          ...p,
          liveClassStats: {
            scheduled: s.scheduled,
            completed: s.completed,
            hoursMinistered: Math.round((s.minutes / 60) * 10) / 10,
            participants: s.participants,
            avgRating: s.scores.length
              ? Math.round((s.scores.reduce((a, b) => a + b, 0) / s.scores.length) * 10) / 10
              : 0,
            courses: [...s.courses],
          },
        };
      })
      .sort((a, b) => b.liveClassStats.completed - a.liveClassStats.completed);
  }

  // ─── Salas & Links (secção 8) — "Salas virtuais" derivadas da Aula/Sessão ──
  // "Gestão operacional" (salas físicas) reutiliza directamente o registo de
  // TrainingResource (kind=ROOM) do módulo Trainings — GET /training-resources
  // — não há aqui um modelo próprio para isso, só para o lado "virtual".

  async listVirtualRooms(filters: LiveClassFilterDto, ownerProfileId?: number) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.LiveClassWhereInput = { modality: { in: ['ONLINE', 'HYBRID'] } };
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.instructorId) where.instructorId = filters.instructorId;
    if (filters.status) where.status = filters.status;
    if (ownerProfileId !== undefined) where.AND = [this.ownClass(ownerProfileId)];

    const [data, total] = await Promise.all([
      this.prisma.read.liveClass.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          topic: true,
          zoomMeetingId: true,
          meetingProvider: true,
          meetingUrl: true,
          status: true,
          scheduledAt: true,
          course: { select: { id: true, title: true } },
          instructor: { select: { id: true, name: true } },
          sessions: {
            select: { id: true, seq: true, meetingUrl: true, sessionDate: true, status: true },
          },
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.read.liveClass.count({ where }),
    ]);

    const rooms = data.map(lc => ({
      liveClassId: lc.id,
      topic: lc.topic,
      course: lc.course,
      instructor: lc.instructor,
      status: lc.status,
      scheduledAt: lc.scheduledAt,
      platform:
        lc.meetingProvider === MeetingProvider.ZOOM
          ? 'Zoom'
          : lc.meetingProvider === MeetingProvider.TEAMS
            ? 'Teams'
            : lc.zoomMeetingId
              ? 'Zoom'
              : lc.sessions.some(s => s.meetingUrl)
                ? 'Personalizada'
                : 'Jitsi',
      meetingId: lc.zoomMeetingId,
      link: lc.meetingUrl ?? lc.sessions.find(s => s.meetingUrl)?.meetingUrl ?? null,
      sessions: lc.sessions,
    }));
    return buildPaginatedResponse(rooms, total, page, limit);
  }

  // ─── Gravações (secção 9) ───────────────────────────────────────────────────

  async listRecordings(filters: LiveClassFilterDto, ownerProfileId?: number) {
    const classWhere: Prisma.LiveClassWhereInput = { recordingUrl: { not: null } };
    if (filters.courseId) classWhere.courseId = filters.courseId;
    if (filters.instructorId) classWhere.instructorId = filters.instructorId;
    if (ownerProfileId !== undefined) classWhere.AND = [this.ownClass(ownerProfileId)];

    const [classRecordings, sessionRecordings] = await Promise.all([
      this.prisma.read.liveClass.findMany({
        where: classWhere,
        select: {
          id: true,
          topic: true,
          recordingUrl: true,
          recordingExpiresAt: true,
          recordingPublishedAt: true,
          allowRecordingDownload: true,
          duration: true,
          scheduledAt: true,
          course: { select: { id: true, title: true } },
          instructor: { select: { id: true, name: true } },
          _count: { select: { attendances: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.read.liveClassSession.findMany({
        where: {
          recordingUrl: { not: null },
          ...(filters.instructorId ? { instructorId: filters.instructorId } : {}),
          ...(filters.courseId ? { liveClass: { courseId: filters.courseId } } : {}),
          ...(ownerProfileId !== undefined
            ? { AND: [{ liveClass: this.ownClass(ownerProfileId) }] }
            : {}),
        },
        select: {
          id: true,
          seq: true,
          recordingUrl: true,
          recordingPublishedAt: true,
          durationMinutes: true,
          sessionDate: true,
          instructor: { select: { id: true, name: true } },
          liveClass: {
            select: { id: true, topic: true, course: { select: { id: true, title: true } } },
          },
          _count: { select: { attendances: true } },
        },
        orderBy: { sessionDate: 'desc' },
      }),
    ]);

    const rows = [
      ...classRecordings.map(lc => ({
        liveClassId: lc.id,
        sessionId: null as string,
        sessionSeq: null as number,
        topic: lc.topic,
        course: lc.course,
        instructor: lc.instructor,
        date: lc.scheduledAt,
        durationMinutes: lc.duration,
        participants: lc._count.attendances,
        recordingUrl: lc.recordingUrl,
        publishedAt: lc.recordingPublishedAt,
        expiresAt: lc.recordingExpiresAt,
        allowDownload: lc.allowRecordingDownload,
      })),
      ...sessionRecordings.map(s => ({
        liveClassId: s.liveClass.id,
        sessionId: s.id,
        sessionSeq: s.seq,
        topic: s.liveClass.topic,
        course: s.liveClass.course,
        instructor: s.instructor,
        date: s.sessionDate,
        durationMinutes: s.durationMinutes,
        participants: s._count.attendances,
        recordingUrl: s.recordingUrl,
        publishedAt: s.recordingPublishedAt,
        expiresAt: null as Date,
        allowDownload: null as boolean | null,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    const { page = 1, limit = 20 } = filters;
    const total = rows.length;
    const start = (page - 1) * limit;
    return buildPaginatedResponse(rows.slice(start, start + limit), total, page, limit);
  }

  async publishRecording(id: number, publish: boolean) {
    const lc = await this.findOne(id);
    const updated = await this.prisma.liveClass.update({
      where: { id },
      data: { recordingPublishedAt: publish ? new Date() : null },
    });
    if (publish && !lc.recordingPublishedAt && lc.recordingUrl) {
      await this.notifyRecordingAvailable(id, null, lc.topic);
    }
    return updated;
  }

  async deleteRecording(id: number) {
    await this.findOne(id);
    return this.prisma.liveClass.update({
      where: { id },
      data: { recordingUrl: null, recordingPublishedAt: null, recordingExpiresAt: null },
    });
  }

  async publishSessionRecording(liveClassId: number, sessionId: number, publish: boolean) {
    const session = await this.prisma.read.liveClassSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.liveClassId !== liveClassId)
      throw new NotFoundException('Sessão não encontrada');
    const updated = await this.prisma.liveClassSession.update({
      where: { id: sessionId },
      data: { recordingPublishedAt: publish ? new Date() : null },
    });
    if (publish && !session.recordingPublishedAt && session.recordingUrl) {
      const lc = await this.findOne(liveClassId);
      await this.notifyRecordingAvailable(liveClassId, sessionId, lc.topic);
    }
    return updated;
  }

  async deleteSessionRecording(liveClassId: number, sessionId: number) {
    const session = await this.prisma.read.liveClassSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.liveClassId !== liveClassId)
      throw new NotFoundException('Sessão não encontrada');
    return this.prisma.liveClassSession.update({
      where: { id: sessionId },
      data: { recordingUrl: null, recordingPublishedAt: null },
    });
  }

  async getUpcoming(ownerProfileId?: number) {
    return this.prisma.read.liveClass.findMany({
      where: {
        scheduledAt: { gte: new Date() },
        status: { notIn: [LiveClassStatus.CANCELADA] },
        ...this.ownClass(ownerProfileId),
      },
      include: {
        course: { select: { id: true, title: true } },
        instructor: { select: { id: true, name: true } },
        _count: { select: { attendances: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 10,
    });
  }

  // ─── Visão Geral (secção 1) ────────────────────────────────────────────────

  async getDashboard(ownerProfileId?: number) {
    const own = this.ownClass(ownerProfileId);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const [
      scheduled,
      inProgress,
      completed,
      cancelled,
      today,
      week,
      upcoming,
      recordingsAvailable,
      byModality,
      attendanceAgg,
    ] = await Promise.all([
      this.prisma.read.liveClass.count({ where: { ...own, status: LiveClassStatus.AGENDADA } }),
      this.prisma.read.liveClass.count({ where: { ...own, status: LiveClassStatus.EM_CURSO } }),
      this.prisma.read.liveClass.count({ where: { ...own, status: LiveClassStatus.CONCLUIDA } }),
      this.prisma.read.liveClass.count({ where: { ...own, status: LiveClassStatus.CANCELADA } }),
      this.prisma.read.liveClass.count({
        where: { ...own, scheduledAt: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.read.liveClass.count({
        where: { ...own, scheduledAt: { gte: startOfToday, lt: endOfWeek } },
      }),
      this.prisma.read.liveClass.count({ where: { ...own, scheduledAt: { gte: now } } }),
      this.prisma.read.liveClass.count({ where: { ...own, recordingUrl: { not: null } } }),
      this.prisma.read.liveClass.groupBy({ by: ['modality'], where: own, _count: { _all: true } }),
      this.prisma.read.liveAttendance.aggregate({
        where: ownerProfileId === undefined ? {} : { liveClass: own },
        _avg: { attendancePercent: true },
        _count: { _all: true },
      }),
    ]);

    const hoursAgg = await this.prisma.read.liveClass.aggregate({
      where: { ...own, status: LiveClassStatus.CONCLUIDA },
      _sum: { duration: true },
    });

    const byInstructor = await this.prisma.read.liveClass.groupBy({
      by: ['instructorId'],
      where: { ...own, instructorId: { not: null } },
      _count: { _all: true },
    });
    const instructorIds = byInstructor
      .map(b => b.instructorId)
      .filter((id): id is number => id !== null);
    const instructors = instructorIds.length
      ? await this.prisma.read.trainingInstructorProfile.findMany({
          where: { id: { in: instructorIds } },
          select: { id: true, name: true },
        })
      : [];
    const instructorName = new Map(instructors.map(i => [i.id, i.name]));

    return {
      cards: {
        scheduled,
        inProgress,
        completed,
        cancelled,
        today,
        thisWeek: week,
        upcoming,
        recordingsAvailable,
        totalParticipants: attendanceAgg._count._all,
        averageAttendancePercent: Math.round(attendanceAgg._avg.attendancePercent ?? 0),
        hoursDelivered: Math.round(((hoursAgg._sum.duration ?? 0) / 60) * 10) / 10,
      },
      byModality: byModality.map(m => ({ modality: m.modality, count: m._count._all })),
      byInstructor: byInstructor
        .map(b => ({
          instructorId: b.instructorId,
          instructorName: instructorName.get(b.instructorId) ?? '—',
          count: b._count._all,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  // ─── Calendário (secção 4) ─────────────────────────────────────────────────

  async getCalendar(from: string, to: string, ownerProfileId?: number) {
    const start = new Date(from);
    const end = new Date(to);
    const [classes, sessions] = await Promise.all([
      this.prisma.read.liveClass.findMany({
        where: { scheduledAt: { gte: start, lte: end }, ...this.ownClass(ownerProfileId) },
        include: {
          course: { select: { id: true, title: true } },
          instructor: { select: { id: true, name: true } },
        },
      }),
      this.prisma.read.liveClassSession.findMany({
        where: {
          sessionDate: { gte: start, lte: end },
          ...(ownerProfileId !== undefined ? { liveClass: this.ownClass(ownerProfileId) } : {}),
        },
        include: {
          instructor: { select: { id: true, name: true } },
          liveClass: {
            select: {
              id: true,
              topic: true,
              modality: true,
              course: { select: { id: true, title: true } },
            },
          },
        },
      }),
    ]);

    const classEvents = classes.map(lc => ({
      id: `class-${lc.id}`,
      liveClassId: lc.id,
      sessionId: null as string,
      title: lc.topic,
      start: lc.scheduledAt,
      end: new Date(lc.scheduledAt.getTime() + lc.duration * 60_000),
      modality: lc.modality,
      status: lc.status,
      courseTitle: lc.course?.title ?? null,
      instructorName: lc.instructor?.name ?? null,
    }));

    const sessionEvents = sessions.map(s => ({
      id: `session-${s.id}`,
      liveClassId: s.liveClassId,
      sessionId: s.id,
      title: s.liveClass.topic,
      start: s.sessionDate,
      end: new Date(s.sessionDate.getTime() + s.durationMinutes * 60_000),
      modality: s.liveClass.modality,
      status: s.status,
      courseTitle: s.liveClass.course?.title ?? null,
      instructorName: s.instructor?.name ?? s.liveClass.topic,
    }));

    return [...classEvents, ...sessionEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // ─── Materiais (secção 11) — reúne LiveClass.materialDocumentIds e
  // LiveClassSession.materialDocumentIds (FK "solta" para a Biblioteca,
  // mesmo padrão de Training.requiredResources) e resolve contra Document. ──

  async listMaterials(filters: MaterialsFilterDto, ownerProfileId?: number) {
    const classWhere: Prisma.LiveClassWhereInput = { materialDocumentIds: { isEmpty: false } };
    if (filters.courseId) classWhere.courseId = filters.courseId;
    if (filters.instructorId) classWhere.instructorId = filters.instructorId;

    const sessionWhere: Prisma.LiveClassSessionWhereInput = {
      materialDocumentIds: { isEmpty: false },
    };
    if (filters.courseId || filters.instructorId) {
      sessionWhere.liveClass = {
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.instructorId ? { instructorId: filters.instructorId } : {}),
      };
    }

    if (ownerProfileId !== undefined) {
      classWhere.AND = [this.ownClass(ownerProfileId)];
      sessionWhere.AND = [{ liveClass: this.ownClass(ownerProfileId) }];
    }

    const [classes, sessions] = await Promise.all([
      this.prisma.read.liveClass.findMany({
        where: classWhere,
        select: {
          id: true,
          topic: true,
          materialDocumentIds: true,
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.read.liveClassSession.findMany({
        where: sessionWhere,
        select: {
          id: true,
          seq: true,
          materialDocumentIds: true,
          liveClass: {
            select: { id: true, topic: true, course: { select: { id: true, title: true } } },
          },
        },
      }),
    ]);

    interface MaterialRef {
      liveClassId: number;
      topic: string;
      course: { id: number; title: string } | null;
      sessionId: number | null;
      sessionSeq: number | null;
    }
    const refs = new Map<number, MaterialRef[]>();
    const touch = (docId: number, ref: MaterialRef) => {
      const arr = refs.get(docId) ?? [];
      arr.push(ref);
      refs.set(docId, arr);
    };
    for (const c of classes) {
      for (const docId of c.materialDocumentIds) {
        touch(docId, {
          liveClassId: c.id,
          topic: c.topic,
          course: c.course,
          sessionId: null,
          sessionSeq: null,
        });
      }
    }
    for (const s of sessions) {
      for (const docId of s.materialDocumentIds) {
        touch(docId, {
          liveClassId: s.liveClass.id,
          topic: s.liveClass.topic,
          course: s.liveClass.course,
          sessionId: s.id,
          sessionSeq: s.seq,
        });
      }
    }

    const documentIds = [...refs.keys()];
    const { page = 1, limit = 20 } = filters;
    if (documentIds.length === 0) return buildPaginatedResponse([], 0, page, limit);

    const documents = await this.prisma.read.document.findMany({
      where: {
        id: { in: documentIds },
        deletedAt: null,
        ...(filters.search ? { title: { contains: filters.search, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        title: true,
        category: true,
        fileUrl: true,
        mimeType: true,
        fileSize: true,
        tags: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = documents.map(document => {
      // O externo vê o material sem o conteúdo do ficheiro (documentos inline vêm como data URL).
      const { fileUrl: _file, ...meta } = document;
      return {
        document: ownerProfileId === undefined ? document : meta,
        referencedBy: refs.get(document.id) ?? [],
      };
    });
    const total = rows.length;
    const start = (page - 1) * limit;
    return buildPaginatedResponse(rows.slice(start, start + limit), total, page, limit);
  }

  private async assertDocumentExists(documentId: number, user?: CurrentUserData) {
    const doc = await this.prisma.read.document.findUnique({ where: { id: documentId } });
    if (!doc || doc.deletedAt)
      throw new NotFoundException('Documento não encontrado na Biblioteca');
    // O externo só anexa documentos que ele próprio carregou: a biblioteca da empresa (RH,
    // confidenciais) não é dele.
    if (
      user &&
      isExternalInstructor(user) &&
      doc.createdById !== user.id &&
      doc.ownerId !== user.id
    ) {
      throw new NotFoundException('Documento não encontrado na Biblioteca');
    }
    return doc;
  }

  async addClassMaterial(liveClassId: number, documentId: number, user?: CurrentUserData) {
    const lc = await this.findOne(liveClassId);
    await this.assertDocumentExists(documentId, user);
    if (lc.materialDocumentIds.includes(documentId)) return lc;
    return this.prisma.liveClass.update({
      where: { id: liveClassId },
      data: { materialDocumentIds: { push: documentId } },
      include: CLASS_INCLUDE,
    });
  }

  async removeClassMaterial(liveClassId: number, documentId: number) {
    const lc = await this.findOne(liveClassId);
    return this.prisma.liveClass.update({
      where: { id: liveClassId },
      data: { materialDocumentIds: lc.materialDocumentIds.filter(id => id !== documentId) },
      include: CLASS_INCLUDE,
    });
  }

  async addSessionMaterial(
    liveClassId: number,
    sessionId: number,
    documentId: number,
    user?: CurrentUserData,
  ) {
    const session = await this.prisma.read.liveClassSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.liveClassId !== liveClassId)
      throw new NotFoundException('Sessão não encontrada');
    await this.assertDocumentExists(documentId, user);
    if (session.materialDocumentIds.includes(documentId)) return session;
    return this.prisma.liveClassSession.update({
      where: { id: sessionId },
      data: { materialDocumentIds: { push: documentId } },
    });
  }

  async removeSessionMaterial(liveClassId: number, sessionId: number, documentId: number) {
    const session = await this.prisma.read.liveClassSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.liveClassId !== liveClassId)
      throw new NotFoundException('Sessão não encontrada');
    return this.prisma.liveClassSession.update({
      where: { id: sessionId },
      data: { materialDocumentIds: session.materialDocumentIds.filter(id => id !== documentId) },
    });
  }

  // ─── Avaliações (secção 12) — lista agregada + resumo (rubrica detalhada
  // e NPS) sobre PostClassResponse, cruzando todas as aulas. ─────────────────

  private buildEvaluationWhere(
    filters: EvaluationsFilterDto,
    ownerProfileId?: number,
  ): Prisma.PostClassResponseWhereInput {
    const liveClassWhere: Prisma.LiveClassWhereInput = {};
    if (ownerProfileId !== undefined) liveClassWhere.AND = [this.ownClass(ownerProfileId)];
    if (filters.courseId) liveClassWhere.courseId = filters.courseId;
    if (filters.instructorId) liveClassWhere.instructorId = filters.instructorId;
    if (filters.dateFrom || filters.dateTo) {
      liveClassWhere.scheduledAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }
    const evaluationWhere: Prisma.PostClassEvaluationWhereInput = {};
    if (filters.liveClassId) evaluationWhere.liveClassId = filters.liveClassId;
    if (Object.keys(liveClassWhere).length) evaluationWhere.liveClass = liveClassWhere;
    return Object.keys(evaluationWhere).length ? { evaluation: evaluationWhere } : {};
  }

  async getEvaluations(filters: EvaluationsFilterDto, ownerProfileId?: number) {
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where = this.buildEvaluationWhere(filters, ownerProfileId);

    const [data, total] = await Promise.all([
      this.prisma.read.postClassResponse.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, fullName: true } },
          evaluation: {
            select: {
              id: true,
              averageScore: true,
              liveClass: {
                select: {
                  id: true,
                  topic: true,
                  scheduledAt: true,
                  course: { select: { id: true, title: true } },
                  instructor: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.postClassResponse.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async getEvaluationsSummary(filters: EvaluationsFilterDto, ownerProfileId?: number) {
    const where = this.buildEvaluationWhere(filters, ownerProfileId);
    const responses = await this.prisma.read.postClassResponse.findMany({
      where,
      select: {
        rating: true,
        instructorRating: true,
        contentRating: true,
        organizationRating: true,
        applicabilityRating: true,
        nps: true,
      },
    });

    const avg = (values: (number | null)[]) => {
      const nums = values.filter((n): n is number => n != null);
      return nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null;
    };

    const npsValues = responses.map(r => r.nps).filter((n): n is number => n != null);
    const promoters = npsValues.filter(n => n >= 9).length;
    const detractors = npsValues.filter(n => n <= 6).length;
    const nps = npsValues.length
      ? Math.round(((promoters - detractors) / npsValues.length) * 100)
      : null;

    return {
      responses: responses.length,
      avgRating: avg(responses.map(r => r.rating)),
      avgInstructorRating: avg(responses.map(r => r.instructorRating)),
      avgContentRating: avg(responses.map(r => r.contentRating)),
      avgOrganizationRating: avg(responses.map(r => r.organizationRating)),
      avgApplicabilityRating: avg(responses.map(r => r.applicabilityRating)),
      nps,
    };
  }

  // ─── Relatórios (secção 13) ─────────────────────────────────────────────────

  private buildReportClassWhere(
    filters: LiveClassReportFilterDto,
    ownerProfileId?: number,
  ): Prisma.LiveClassWhereInput {
    const where: Prisma.LiveClassWhereInput = {};
    if (ownerProfileId !== undefined) where.AND = [this.ownClass(ownerProfileId)];
    if (filters.year) {
      where.scheduledAt = {
        gte: new Date(filters.year, 0, 1),
        lt: new Date(filters.year + 1, 0, 1),
      };
    }
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.instructorId) where.instructorId = filters.instructorId;
    if (filters.departmentId) where.targetDeptIds = { has: filters.departmentId };
    if (filters.unitId) where.targetUnitIds = { has: filters.unitId };
    return where;
  }

  async getReports(filters: LiveClassReportFilterDto, ownerProfileId?: number) {
    const where = this.buildReportClassWhere(filters, ownerProfileId);

    const classes = await this.prisma.read.liveClass.findMany({
      where,
      select: {
        id: true,
        status: true,
        duration: true,
        scheduledAt: true,
        minAttendancePercent: true,
        lateToleranceMinutes: true,
        instructorId: true,
        instructor: { select: { id: true, name: true } },
        postEvaluation: { select: { averageScore: true } },
      },
    });
    const classIds = classes.map(c => c.id);
    const classById = new Map(classes.map(c => [c.id, c]));

    const attendances = classIds.length
      ? await this.prisma.read.liveAttendance.findMany({
          where: { liveClassId: { in: classIds } },
          select: {
            liveClassId: true,
            joinedAt: true,
            leftAt: true,
            accumulatedSeconds: true,
            currentJoinedAt: true,
            status: true,
            user: {
              select: {
                id: true,
                fullName: true,
                department: { select: { id: true, name: true } },
                unit: { select: { id: true, name: true } },
              },
            },
          },
        })
      : [];

    const derived = attendances.map(a => ({
      ...a,
      ...this.deriveAttendance(a, classById.get(a.liveClassId)!),
    }));

    const presente = derived.filter(a => a.computedStatus === 'PRESENTE').length;
    const ausente = derived.filter(a => a.computedStatus === 'AUSENTE').length;
    const atrasado = derived.filter(a => a.computedStatus === 'ATRASADO').length;

    const completed = classes.filter(c => c.status === LiveClassStatus.CONCLUIDA);
    const cancelled = classes.filter(c => c.status === LiveClassStatus.CANCELADA);
    const hoursDelivered = completed.reduce((sum, c) => sum + c.duration, 0) / 60;

    const evaluatedScores = classes
      .map(c => c.postEvaluation?.averageScore)
      .filter((n): n is number => !!n);
    const avgEvaluation = evaluatedScores.length
      ? Math.round((evaluatedScores.reduce((a, b) => a + b, 0) / evaluatedScores.length) * 10) / 10
      : null;

    // Desempenho por formador
    interface InstructorAgg {
      name: string;
      completed: number;
      scores: number[];
    }
    const byInstructorMap = new Map<number, InstructorAgg>();
    for (const c of classes) {
      if (!c.instructorId) continue;
      const agg = byInstructorMap.get(c.instructorId) ?? {
        name: c.instructor?.name ?? '—',
        completed: 0,
        scores: [],
      };
      if (c.status === LiveClassStatus.CONCLUIDA) agg.completed++;
      if (c.postEvaluation?.averageScore) agg.scores.push(c.postEvaluation.averageScore);
      byInstructorMap.set(c.instructorId, agg);
    }
    const byInstructor = [...byInstructorMap.values()]
      .map(a => ({
        instructor: a.name,
        completed: a.completed,
        avgRating: a.scores.length
          ? Math.round((a.scores.reduce((x, y) => x + y, 0) / a.scores.length) * 10) / 10
          : null,
      }))
      .sort((a, b) => b.completed - a.completed);

    // Participação por departamento / unidade
    const toSortedCount = (values: (string | null | undefined)[], key: string) => {
      const m = new Map<string, number>();
      for (const v of values) {
        const k = v ?? 'Sem atribuição';
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()]
        .map(([k, count]) => ({ [key]: k, count }))
        .sort((a, b) => b.count - a.count);
    };
    const byDepartment = toSortedCount(
      attendances.map(a => a.user.department?.name),
      'department',
    );
    const byUnit = toSortedCount(
      attendances.map(a => a.user.unit?.name),
      'unit',
    );

    // Horas de formação por colaborador (participações com presença efectiva)
    const hoursByUserMap = new Map<number, { name: string; minutes: number }>();
    for (const a of derived) {
      if (a.computedStatus !== 'PRESENTE' && a.computedStatus !== 'ATRASADO') continue;
      if (!a.durationMinutes) continue;
      const entry = hoursByUserMap.get(a.user.id) ?? { name: a.user.fullName, minutes: 0 };
      entry.minutes += a.durationMinutes;
      hoursByUserMap.set(a.user.id, entry);
    }
    const hoursByCollaborator = [...hoursByUserMap.entries()]
      .map(([userId, v]) => ({
        userId,
        collaborator: v.name,
        hours: Math.round((v.minutes / 60) * 10) / 10,
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 20);

    return {
      filters,
      totals: {
        classes: classes.length,
        completed: completed.length,
        cancelled: cancelled.length,
        hoursDelivered: Math.round(hoursDelivered * 10) / 10,
      },
      attendance: {
        participants: attendances.length,
        present: presente,
        absent: ausente,
        late: atrasado,
        attendanceRate:
          attendances.length > 0 ? Math.round((presente / attendances.length) * 100) : 0,
      },
      avgEvaluation,
      byInstructor,
      byDepartment,
      byUnit,
      hoursByCollaborator,
    };
  }

  async exportReportsCsv(
    filters: LiveClassReportFilterDto,
    ownerProfileId?: number,
  ): Promise<string> {
    const report = await this.getReports(filters, ownerProfileId);
    const rows = [
      { metrica: 'Aulas (total)', valor: report.totals.classes },
      { metrica: 'Aulas realizadas', valor: report.totals.completed },
      { metrica: 'Aulas canceladas', valor: report.totals.cancelled },
      { metrica: 'Horas ministradas', valor: report.totals.hoursDelivered },
      { metrica: 'Participantes', valor: report.attendance.participants },
      { metrica: 'Presenças', valor: report.attendance.present },
      { metrica: 'Ausências', valor: report.attendance.absent },
      { metrica: 'Atrasos', valor: report.attendance.late },
      { metrica: 'Taxa de presença (%)', valor: report.attendance.attendanceRate },
      { metrica: 'Avaliação média', valor: report.avgEvaluation ?? '' },
    ];
    return buildCsvString(rows, ['metrica', 'valor']);
  }

  // ─── Configurações (secção 14) — vista agregada, só de leitura, sobre os
  // enums do domínio e os @default reais do schema + os papéis já aplicados
  // no controller. Não inventa um mecanismo de configuração novo para o que
  // já é código — mesmo padrão de evaluation.service.ts#getSettings(). ──────

  getSettings() {
    return {
      types: Object.values(LiveClassType),
      statuses: Object.values(LiveClassStatus),
      modalities: Object.values(SessionModality),
      recurrences: Object.values(LiveClassRecurrence),
      enrollmentModes: Object.values(LiveClassEnrollmentMode),
      attendanceStatuses: Object.values(LiveAttendanceStatus),
      attendanceDefaults: {
        minAttendancePercent: 70,
        lateToleranceMinutes: 10,
      },
      recordingDefaults: {
        recordSession: true,
        allowRecordingDownload: false,
      },
      notifySettingsKeys: [
        'onEnroll',
        'reminder24h',
        'reminder1h',
        'onStart',
        'onReschedule',
        'onCancel',
        'onRecordingAvailable',
      ],
      notificationChannels: ['INNOVA', 'EMAIL', 'PUSH', 'SMS', 'WHATSAPP'],
      permissions: [
        { action: 'Criar / editar / cancelar / adiar / duplicar aula', roles: ['ADMIN', 'RH'] },
        { action: 'Iniciar aula', roles: ['ADMIN', 'RH', 'INSTRUCTOR'] },
        { action: 'Gerir participantes e presenças', roles: ['ADMIN', 'RH', 'LIDER'] },
        { action: 'Publicar / eliminar gravações', roles: ['ADMIN', 'RH'] },
        {
          action: 'Ver relatório de presença e relatórios agregados',
          roles: ['ADMIN', 'RH', 'LIDER'],
        },
        {
          action: 'Entrar na aula, usar o chat, responder à avaliação pós-aula',
          roles: ['Qualquer utilizador autenticado'],
        },
      ],
    };
  }
}
