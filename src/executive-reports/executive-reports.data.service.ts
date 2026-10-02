// src/executive-reports/executive-reports.data.service.ts
// Agregação por domínio (docs/Executive_Reports.md §10): colaboradores, formação,
// desempenho, assiduidade, organização e custos. Reutiliza as secções do builder
// e o âmbito/permissões do dashboard — não duplica consultas nem regras.
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ExecutiveReportsService } from './executive-reports.service';
import { ExecutiveReportsGenerationService } from './executive-reports.generation.service';
import { ExecutiveReportsMetricsService } from './executive-reports.metrics.service';
import { ExecutiveReportsAuditService } from './executive-reports.audit.service';
import type { ExecutiveFiltersDto } from './dto/executive-filters.dto';
import type { SectionKey } from './executive-reports.templates';
import type { KpiCode } from './executive-reports.kpi-catalog';
import type { CurrentUserData } from '../common/decorators';

export type ExecutiveDomain =
  'workforce' | 'training' | 'performance' | 'attendance' | 'organization' | 'costs';

interface DomainDef {
  title: string;
  sections: SectionKey[];
  kpiCodes: KpiCode[];
  /** Domínio inteiro só para ADMIN/DIRECTOR (§12.5). */
  restricted?: boolean;
}

export const DOMAINS: Record<ExecutiveDomain, DomainDef> = {
  workforce: {
    title: 'Colaboradores',
    sections: ['workforce', 'movements', 'onboarding'],
    kpiCodes: ['HEADCOUNT', 'TURNOVER'],
  },
  training: {
    title: 'Formação',
    sections: ['training'],
    kpiCodes: ['TRAINING_COMPLETION'],
  },
  performance: {
    title: 'Desempenho e talento',
    sections: ['performance', 'competencies', 'pdi', 'goals'],
    kpiCodes: ['PERFORMANCE', 'PDI_OVERDUE'],
  },
  attendance: {
    title: 'Assiduidade e ausências',
    sections: ['attendance', 'leave'],
    kpiCodes: ['ATTENDANCE'],
  },
  organization: {
    title: 'Comparação entre unidades',
    sections: ['departments'],
    kpiCodes: [],
  },
  costs: {
    title: 'Custos autorizados',
    sections: ['costs'],
    kpiCodes: [],
    restricted: true,
  },
};

const RESTRICTED_ROLES = ['ADMIN', 'DIRECTOR'];

@Injectable()
export class ExecutiveReportsDataService {
  constructor(
    private readonly executive: ExecutiveReportsService,
    private readonly generation: ExecutiveReportsGenerationService,
    private readonly metrics: ExecutiveReportsMetricsService,
    private readonly audit: ExecutiveReportsAuditService,
  ) {}

  async domain(user: CurrentUserData, domain: ExecutiveDomain, filters: ExecutiveFiltersDto) {
    const def = DOMAINS[domain];
    const role = user.role?.name ?? '';
    if (def.restricted && !RESTRICTED_ROLES.includes(role)) {
      throw new ForbiddenException('Dados de acesso restrito (ADMIN/DIRECTOR)');
    }

    const built = await this.generation.buildContent(
      user,
      { code: domain, name: def.title, version: 1, reportType: 'CUSTOM', sections: def.sections },
      filters,
    );
    const kpis = def.kpiCodes.length ? await this.metrics.computeKpis(built.f, def.kpiCodes) : [];

    await this.audit.record({
      userId: user.id,
      action: 'DOMAIN_VIEW',
      filters: { domain, ...this.executive.contextOf(built.f) },
    });

    return {
      domain,
      title: def.title,
      context: this.executive.contextOf(built.f),
      kpis,
      sections: built.sections,
      omitted: built.omitted,
      sourceModules: built.sourceModules,
    };
  }
}
