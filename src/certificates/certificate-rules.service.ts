import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CertificateActivityKind, CertificateIssueMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { RuleCriteria } from './certificate-rules';
import { UpsertCertificateRuleDto } from './certificates-admin.dto';

export interface CertificateRuleView {
  id: number;
  activityKind: CertificateActivityKind;
  activityId: number;
  activityTitle: string | null;
  mode: CertificateIssueMode;
  criteria: RuleCriteria;
  validityDays: number | null;
  active: boolean;
  updatedAt: Date;
}

// O CertificateFactsService só sabe recolher factos de cursos e eventos.
const SUPPORTED_KINDS: CertificateActivityKind[] = ['COURSE', 'EVENT'];

function parseCriteria(raw: string): RuleCriteria {
  try {
    const parsed: RuleCriteria | null = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Remove chaves não definidas e critérios booleanos a false (não activos). */
function activeCriteria(c: RuleCriteria): RuleCriteria {
  const out: Record<string, boolean | number> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v === undefined || v === null || v === false) continue;
    out[k] = v;
  }
  return out;
}

@Injectable()
export class CertificateRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listRules(): Promise<CertificateRuleView[]> {
    const rules = await this.prisma.certificateRule.findMany({ orderBy: { updatedAt: 'desc' } });
    const courseIds = rules.filter(r => r.activityKind === 'COURSE').map(r => r.activityId);
    const eventIds = rules.filter(r => r.activityKind === 'EVENT').map(r => r.activityId);
    const [courses, events] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      }),
      this.prisma.event.findMany({
        where: { id: { in: eventIds } },
        select: { id: true, title: true },
      }),
    ]);
    const titles = new Map<string, string>([
      ...courses.map(c => [`COURSE:${c.id}`, c.title] as [string, string]),
      ...events.map(e => [`EVENT:${e.id}`, e.title] as [string, string]),
    ]);
    return rules.map(r => ({
      id: r.id,
      activityKind: r.activityKind,
      activityId: r.activityId,
      activityTitle: titles.get(`${r.activityKind}:${r.activityId}`) ?? null,
      mode: r.mode,
      criteria: parseCriteria(r.criteria),
      validityDays: r.validityDays,
      active: r.active,
      updatedAt: r.updatedAt,
    }));
  }

  async upsertRule(dto: UpsertCertificateRuleDto, actorId: number): Promise<CertificateRuleView> {
    if (!SUPPORTED_KINDS.includes(dto.activityKind)) {
      throw new BadRequestException('Só cursos e eventos suportam regras de emissão por agora');
    }
    const criteria = activeCriteria(dto.criteria);
    if (Object.keys(criteria).length === 0) {
      throw new BadRequestException('Defina pelo menos um critério de emissão');
    }

    const exists =
      dto.activityKind === 'COURSE'
        ? await this.prisma.course.findUnique({
            where: { id: dto.activityId },
            select: { id: true },
          })
        : await this.prisma.event.findUnique({
            where: { id: dto.activityId },
            select: { id: true },
          });
    if (!exists) throw new NotFoundException('Atividade não encontrada');

    const key = { activityKind: dto.activityKind, activityId: dto.activityId };
    const previous = await this.prisma.certificateRule.findUnique({
      where: { activityKind_activityId: key },
    });
    const data = {
      mode: dto.mode,
      criteria: JSON.stringify(criteria),
      validityDays: dto.validityDays ?? null,
      active: dto.active ?? true,
    };
    const saved = await this.prisma.certificateRule.upsert({
      where: { activityKind_activityId: key },
      create: { ...key, ...data, createdById: actorId },
      update: data,
    });

    await this.audit.log({
      action: 'CERTIFICATE_RULE_UPSERTED',
      entity: 'CertificateRule',
      entityId: saved.id,
      userId: actorId,
      before: previous
        ? {
            mode: previous.mode,
            criteria: parseCriteria(previous.criteria),
            validityDays: previous.validityDays,
            active: previous.active,
          }
        : undefined,
      after: { mode: dto.mode, criteria, validityDays: data.validityDays, active: data.active },
      metadata: key,
      strict: true,
    });

    return {
      id: saved.id,
      activityKind: saved.activityKind,
      activityId: saved.activityId,
      activityTitle: null,
      mode: saved.mode,
      criteria,
      validityDays: saved.validityDays,
      active: saved.active,
      updatedAt: saved.updatedAt,
    };
  }
}
