// src/events/events.dto.ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  Min,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  EventType,
  EventModalidade,
  EventStatus,
  EventVisibility,
  EventParticipantStatus as ParticipantStatus,
  EventSessionStatus,
  EventLogisticsStatus,
  EventEquipmentType,
  EventSpeakerType,
  EventSpeakerStatus,
  EventCommunicationType,
  EventCommunicationChannel,
  EventCommunicationStatus,
  EventCheckinMethod,
} from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

// ─── Enums ────────────────────────────────────────────────────────────────────
// NOTA: ParticipantStatus aqui é o `EventParticipantStatus` do Prisma — nome
// local mantido por compatibilidade, distinto do `ParticipantStatus`
// (LeadershipProgramParticipant, lote 4) e `TrainingParticipantStatus` (lote 5).

export {
  EventType,
  EventModalidade,
  EventStatus,
  EventVisibility,
  ParticipantStatus,
  EventSessionStatus,
  EventLogisticsStatus,
  EventEquipmentType,
  EventSpeakerType,
  EventSpeakerStatus,
  EventCommunicationType,
  EventCommunicationChannel,
  EventCommunicationStatus,
  EventCheckinMethod,
};

// ─── Event ────────────────────────────────────────────────────────────────────

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Código do evento' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Objetivo do evento' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiProperty({ enum: EventType, default: EventType.TRAINING })
  @IsEnum(EventType)
  type!: EventType;

  @ApiPropertyOptional({ description: 'Categoria livre do evento' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: EventModalidade, default: EventModalidade.ONLINE })
  @IsOptional()
  @IsEnum(EventModalidade)
  modalidade?: EventModalidade;

  @ApiPropertyOptional({ enum: EventVisibility, default: EventVisibility.INTERNAL })
  @IsOptional()
  @IsEnum(EventVisibility)
  visibility?: EventVisibility;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ description: 'Fuso horário (IANA)', default: 'Africa/Luanda' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Localização física' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Endereço completo do local' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Sala/espaço dentro do local' })
  @IsOptional()
  @IsString()
  room?: string;

  @ApiPropertyOptional({ description: 'Link para evento virtual (Zoom, Teams, Meet)' })
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'Senha do meeting' })
  @IsOptional()
  @IsString()
  meetingPassword?: string;

  @ApiPropertyOptional({ description: 'Capacidade máxima de participantes', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxCapacity?: number;

  @ApiPropertyOptional({ description: 'Habilitar lista de espera automática', default: true })
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Inscrições requerem aprovação manual' })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ description: 'Início do período de inscrições' })
  @IsOptional()
  @IsDateString()
  registrationStartAt?: string;

  @ApiPropertyOptional({ description: 'Fim do período de inscrições' })
  @IsOptional()
  @IsDateString()
  registrationEndAt?: string;

  @ApiPropertyOptional({ description: 'Público-alvo do evento' })
  @IsOptional()
  @IsString()
  targetAudience?: string;

  @ApiPropertyOptional({ description: 'Permitir acompanhante na inscrição' })
  @IsOptional()
  @IsBoolean()
  allowGuest?: boolean;

  @ApiPropertyOptional({ description: 'Emitir certificado automático ao concluir' })
  @IsOptional()
  @IsBoolean()
  certificateEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Habilitar avaliação/feedback pós-evento', default: true })
  @IsOptional()
  @IsBoolean()
  evaluationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Habilitar check-in de presença', default: true })
  @IsOptional()
  @IsBoolean()
  checkinEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Habilitar notificações do evento', default: true })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Presença mínima para certificado (0-100)', default: 80 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minAttendancePercent?: number;

  @ApiPropertyOptional({ description: 'Tags do evento' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'IDs de departamentos restritos' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  restrictedDeptIds?: number[];

  @ApiPropertyOptional({ description: 'Inscrição obrigatória (tracking de compliance)' })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional({ description: 'ID do curso associado' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'ID do utilizador responsável pelo evento' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'ID do departamento do evento' })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'ID da unidade do evento' })
  @IsOptional()
  @IsInt()
  unitId?: number;

  @ApiPropertyOptional({ description: 'URL da imagem/banner' })
  @IsOptional()
  @IsString()
  bannerUrl?: string;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}

// ─── Participante ─────────────────────────────────────────────────────────────

export class UpdateParticipantStatusDto {
  @ApiProperty({ enum: ParticipantStatus })
  @IsEnum(ParticipantStatus)
  status!: ParticipantStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

// ─── Check-in ─────────────────────────────────────────────────────────────────

export class CheckInDto {
  @ApiProperty({ description: 'ID do evento' })
  @IsInt()
  eventId!: number;

  @ApiPropertyOptional({ description: 'Código QR (para presencial)' })
  @IsOptional()
  @IsString()
  qrCode?: string;

  @ApiPropertyOptional({ enum: EventCheckinMethod })
  @IsOptional()
  @IsEnum(EventCheckinMethod)
  method?: EventCheckinMethod;
}

export class CheckOutDto {
  @ApiProperty({ description: 'ID do evento' })
  @IsInt()
  eventId!: number;
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export class SubmitFeedbackDto {
  @ApiProperty({ description: 'NPS 1-10' })
  @IsInt()
  @Min(1)
  @Max(10)
  nps!: number;

  @ApiPropertyOptional({ description: 'Rating do evento 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Avaliação do instrutor 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  instructorRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

// ─── Gestão de participantes (docs/events.md #4) ───────────────────────────────

export class AddParticipantsDto {
  @ApiProperty({ description: 'IDs dos colaboradores a inscrever (adicionar ou importar)' })
  @IsArray()
  @IsInt({ each: true })
  userIds!: number[];
}

export class ParticipantActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class EventParticipantFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: ParticipantStatus })
  @IsOptional()
  @IsEnum(ParticipantStatus)
  status?: ParticipantStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional({ description: 'Pesquisa por nome do colaborador' })
  @IsOptional()
  @IsString()
  search?: string;
}

// ─── Calendário (docs/events.md #3) ────────────────────────────────────────────

export class EventCalendarFilterDto {
  @ApiProperty({ description: 'Início do intervalo (ISO)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'Fim do intervalo (ISO)' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Pesquisa livre no local do evento' })
  @IsOptional()
  @IsString()
  location?: string;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export class EventFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @ApiPropertyOptional({ enum: EventModalidade })
  @IsOptional()
  @IsEnum(EventModalidade)
  modalidade?: EventModalidade;

  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  organizerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  // Os 2 campos abaixo: @Type(() => Boolean) coage '?campo=false' para true —
  // ver [[project-innova-boolean-query-filter-coercion]]. @Type(() => String)
  // + @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  upcoming?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mandatory?: boolean;
}

// ─── Programação (docs/events.md #5) ───────────────────────────────────────

export class CreateEventSessionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  room?: string;

  @ApiPropertyOptional({ description: 'ID do utilizador responsável pela sessão' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ description: 'Orador da sessão (texto livre)' })
  @IsOptional()
  @IsString()
  speaker?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ enum: EventSessionStatus, default: EventSessionStatus.SCHEDULED })
  @IsOptional()
  @IsEnum(EventSessionStatus)
  status?: EventSessionStatus;
}

export class UpdateEventSessionDto extends PartialType(CreateEventSessionDto) {}

export class EventSessionFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  eventId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;

  @ApiPropertyOptional({ enum: EventSessionStatus })
  @IsOptional()
  @IsEnum(EventSessionStatus)
  status?: EventSessionStatus;

  @ApiPropertyOptional({ description: 'Início do intervalo de datas (ISO)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Fim do intervalo de datas (ISO)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Pesquisa livre no título da sessão' })
  @IsOptional()
  @IsString()
  search?: string;
}

// ─── Locais & Logística (docs/events.md #6) ────────────────────────────────

export class UpsertEventLogisticsDto {
  @ApiPropertyOptional({ description: 'ID do utilizador responsável pela logística' })
  @IsOptional()
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional({ enum: EventEquipmentType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(EventEquipmentType, { each: true })
  equipment?: EventEquipmentType[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourcesNeeded?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  suppliers?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  catering?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transport?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accommodation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  security?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decoration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  actualCost?: number;

  @ApiPropertyOptional({ enum: EventLogisticsStatus, default: EventLogisticsStatus.PLANNED })
  @IsOptional()
  @IsEnum(EventLogisticsStatus)
  status?: EventLogisticsStatus;
}

// ─── Oradores & Convidados (docs/events.md #7) ─────────────────────────────

export class CreateEventSpeakerDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: EventSpeakerType })
  @IsEnum(EventSpeakerType)
  type!: EventSpeakerType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional({ description: 'Cargo' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ description: 'Contacto (email/telefone, texto livre)' })
  @IsOptional()
  @IsString()
  contact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'URL da fotografia' })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'Tema da participação' })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional({
    description: 'ID da sessão a que fica associado (opcional)',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  sessionId?: number | null;

  @ApiPropertyOptional({ description: 'Horário (texto livre, ex.: "09:00–09:30")' })
  @IsOptional()
  @IsString()
  schedule?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialNeeds?: string;

  @ApiPropertyOptional({ description: 'Honorários' })
  @IsOptional()
  @IsNumber()
  fee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transport?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accommodation?: string;

  @ApiPropertyOptional({ enum: EventSpeakerStatus, default: EventSpeakerStatus.INVITED })
  @IsOptional()
  @IsEnum(EventSpeakerStatus)
  status?: EventSpeakerStatus;
}

export class UpdateEventSpeakerDto extends PartialType(CreateEventSpeakerDto) {}

export class EventSpeakerFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: EventSpeakerType })
  @IsOptional()
  @IsEnum(EventSpeakerType)
  type?: EventSpeakerType;

  @ApiPropertyOptional({ enum: EventSpeakerStatus })
  @IsOptional()
  @IsEnum(EventSpeakerStatus)
  status?: EventSpeakerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sessionId?: number;

  @ApiPropertyOptional({ description: 'Pesquisa livre no nome/organização' })
  @IsOptional()
  @IsString()
  search?: string;
}

// ─── Comunicação (docs/events.md #8) ───────────────────────────────────────

export class CreateEventCommunicationDto {
  @ApiProperty({ enum: EventCommunicationType })
  @IsEnum(EventCommunicationType)
  type!: EventCommunicationType;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  subject!: string;

  @ApiProperty()
  @IsString()
  message!: string;

  @ApiProperty({ enum: EventCommunicationChannel })
  @IsEnum(EventCommunicationChannel)
  channel!: EventCommunicationChannel;

  @ApiPropertyOptional({
    enum: ParticipantStatus,
    isArray: true,
    description:
      'Filtrar destinatários por estado de inscrição — omitido envia a todos os inscritos',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ParticipantStatus, { each: true })
  participantStatuses?: ParticipantStatus[];
}

export class EventCommunicationFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  eventId?: number;

  @ApiPropertyOptional({ enum: EventCommunicationType })
  @IsOptional()
  @IsEnum(EventCommunicationType)
  type?: EventCommunicationType;

  @ApiPropertyOptional({ enum: EventCommunicationChannel })
  @IsOptional()
  @IsEnum(EventCommunicationChannel)
  channel?: EventCommunicationChannel;

  @ApiPropertyOptional({ enum: EventCommunicationStatus })
  @IsOptional()
  @IsEnum(EventCommunicationStatus)
  status?: EventCommunicationStatus;
}

// ─── Check-in & Presença (docs/events.md #9) ───────────────────────────────

export class ManualCheckInDto {
  @ApiPropertyOptional({ enum: EventCheckinMethod, default: EventCheckinMethod.MANUAL })
  @IsOptional()
  @IsEnum(EventCheckinMethod)
  method?: EventCheckinMethod;

  @ApiPropertyOptional({ description: 'Observação sobre o check-in' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Hora de entrada (ISO) — omitido usa o momento actual' })
  @IsOptional()
  @IsDateString()
  at?: string;
}

export class ManualCheckOutDto {
  @ApiPropertyOptional({ description: 'Hora de saída (ISO) — omitido usa o momento actual' })
  @IsOptional()
  @IsDateString()
  at?: string;
}

export class EventCheckinFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  eventId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional({ enum: ParticipantStatus })
  @IsOptional()
  @IsEnum(ParticipantStatus)
  status?: ParticipantStatus;

  @ApiPropertyOptional({ enum: EventCheckinMethod })
  @IsOptional()
  @IsEnum(EventCheckinMethod)
  method?: EventCheckinMethod;

  @ApiPropertyOptional({ description: 'Início do intervalo de datas de entrada (ISO)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Fim do intervalo de datas de entrada (ISO)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Pesquisa por nome do colaborador' })
  @IsOptional()
  @IsString()
  search?: string;
}
