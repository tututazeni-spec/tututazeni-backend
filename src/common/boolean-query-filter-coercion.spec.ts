// src/common/boolean-query-filter-coercion.spec.ts
// Ver memory project-innova-boolean-query-filter-coercion: qualquer campo
// `@IsOptional() @IsBoolean() @Type(() => Boolean) foo?: boolean` — sob o
// ValidationPipe real da app (main.ts: `transform: true,
// transformOptions: { enableImplicitConversion: true }`) — transforma a
// query string '?foo=false' em `true`, não `false`. Root cause: o
// class-transformer coage para Boolean (`Boolean('false') === true`)
// *antes* de qualquer @Transform custom correr.
//
// Este ficheiro replica exactamente o transformOptions de main.ts via
// plainToInstance() para verificar, contra as DTOs reais dos módulos
// afectados (não uma classe sintética), que '?foo=false' produz `false`.
// Não é um teste de integração (não sobe a app), mas exercita o mesmo
// mecanismo do class-transformer que a integração exerceria — a mesma
// técnica usada para confirmar o bug originalmente.

import { plainToInstance } from 'class-transformer';
import { AiSessionFilterDto } from '../ai-tutor/ai-tutor.dto';
import { AnalyticsFilterDto } from '../analytics/analytics.dto';
import { AuditFilterDto } from '../audit/audit.dto';
import { AvatarFilterDto } from '../avatar-training/avatar-training.dto';
import { VacancyFilterDto, CareerAnalyticsFilterDto } from '../career/career.dto';
import { SkillFilterDto } from '../competency-map/competency-map.dto';
import { ContentFilterDto } from '../content-library/content-library.dto';
import { CourseFilterDto } from '../courses/courses.dto';
import { DepartmentFilterDto } from '../departments/departments.dto';
import { DocumentFilterDto } from '../document-repository/document-repository.dto';
import { EventFilterDto } from '../events/events.dto';
import { NotificationFilterDto } from '../notifications/notifications.dto';
import { UserFilterDto } from '../users/users.dto';

const TRANSFORM_OPTIONS = { enableImplicitConversion: true };

// [Dto, campo, descrição] — cobre todos os campos ainda afectados
// confirmados por grep em 2026-08-09 (ver memory para o histórico dos que
// já tinham sido corrigidos antes desta sessão).
const CASES: Array<[new () => object, string, string]> = [
  [AiSessionFilterDto, 'activeOnly', 'ai-tutor'],
  [AnalyticsFilterDto, 'includeInactive', 'analytics'],
  [AuditFilterDto, 'criticalOnly', 'audit'],
  [AvatarFilterDto, 'isPublic', 'avatar-training'],
  [VacancyFilterDto, 'matchingOnly', 'career (Vacancy)'],
  [CareerAnalyticsFilterDto, 'includeRisk', 'career (Analytics)'],
  [SkillFilterDto, 'active', 'competency-map'],
  [ContentFilterDto, 'mandatory', 'content-library (mandatory)'],
  [ContentFilterDto, 'hasCertification', 'content-library (hasCertification)'],
  [ContentFilterDto, 'isMicrolearning', 'content-library (isMicrolearning)'],
  [CourseFilterDto, 'mandatory', 'courses'],
  [DepartmentFilterDto, 'active', 'departments (active)'],
  [DepartmentFilterDto, 'rootOnly', 'departments (rootOnly)'],
  [DocumentFilterDto, 'expiringSoon', 'document-repository (expiringSoon)'],
  [DocumentFilterDto, 'expired', 'document-repository (expired)'],
  [EventFilterDto, 'upcoming', 'events (upcoming)'],
  [EventFilterDto, 'mandatory', 'events (mandatory)'],
  [NotificationFilterDto, 'read', 'notifications'],
  [UserFilterDto, 'active', 'users'],
];

describe('Coerção de filtros booleanos de query (ValidationPipe real)', () => {
  it.each(CASES)('%s.%s: "false" → false, "true" → true, ausente → undefined', (Dto, field) => {
    const whenFalse = plainToInstance(Dto, { [field]: 'false' }, TRANSFORM_OPTIONS) as Record<
      string,
      unknown
    >;
    const whenTrue = plainToInstance(Dto, { [field]: 'true' }, TRANSFORM_OPTIONS) as Record<
      string,
      unknown
    >;
    const whenAbsent = plainToInstance(Dto, {}, TRANSFORM_OPTIONS) as Record<string, unknown>;

    expect(whenFalse[field]).toBe(false);
    expect(whenTrue[field]).toBe(true);
    expect(whenAbsent[field]).toBeUndefined();
  });
});
