// src/automation/automation-templates.service.ts
// §11 — biblioteca de modelos pré-configurados. Instanciar um modelo cria uma
// automação em RASCUNHO (inactiva) com os campos já preenchidos; o administrador
// revê, testa e publica — nunca fica activa sem esse passo.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationService } from './automation.service';
import { AutomationAuditService } from './automation-audit.service';
import { CreateRuleDto } from './automation.dto';
import { InstantiateTemplateDto, TemplateFilterDto } from './automation-governance.dto';
import { FlowDefinition, validateFlow } from './automation-flow';
import {
  AUTOMATION_TEMPLATES,
  AutomationTemplate,
  coerceTemplateValues,
  resolveTemplateValues,
  templateByKey,
} from './automation-templates.catalog';

@Injectable()
export class AutomationTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
    private readonly audit: AutomationAuditService,
  ) {}

  private view(t: AutomationTemplate, created: Map<string, number>) {
    return {
      key: t.key,
      name: t.name,
      area: t.area,
      description: t.description,
      category: t.category,
      module: t.module,
      trigger: t.trigger,
      conditions: t.conditions,
      flow: t.flow,
      modules: t.modules,
      fields: t.fields,
      limitations: t.limitations,
      manualMinutesSaved: t.manualMinutesSaved,
      tags: t.tags,
      instances: created.get(t.key) ?? 0,
    };
  }

  private async instanceCounts(): Promise<Map<string, number>> {
    const rules = await this.prisma.read.automationRule
      .findMany({ where: { templateKey: { not: null } }, select: { templateKey: true } })
      .catch(() => []);
    const counts = new Map<string, number>();
    for (const r of rules) {
      if (r.templateKey) counts.set(r.templateKey, (counts.get(r.templateKey) ?? 0) + 1);
    }
    return counts;
  }

  async list(f: TemplateFilterDto = {}) {
    const q = f.search?.trim().toLowerCase();
    const counts = await this.instanceCounts();
    return AUTOMATION_TEMPLATES.filter(
      t =>
        (!f.area || t.area.toLowerCase() === f.area.toLowerCase()) &&
        (!q || `${t.name} ${t.description} ${t.area}`.toLowerCase().includes(q)),
    ).map(t => this.view(t, counts));
  }

  async get(key: string) {
    const t = templateByKey(key);
    if (!t) throw new NotFoundException('Modelo não encontrado');
    return this.view(t, await this.instanceCounts());
  }

  async instantiate(key: string, dto: InstantiateTemplateDto, userId: number) {
    const t = templateByKey(key);
    if (!t) throw new NotFoundException('Modelo não encontrado');

    const { values, errors } = coerceTemplateValues(t, dto.values);
    if (errors.length) throw new BadRequestException(errors.join(' '));

    const flow = resolveTemplateValues(t.flow, values) as FlowDefinition;
    const conditions = resolveTemplateValues(t.conditions, values);
    const check = validateFlow(flow);
    if (!check.valid) {
      throw new BadRequestException(`O modelo ficou inválido: ${check.errors.join(' ')}`);
    }

    const rule: CreateRuleDto = {
      name: dto.name?.trim() || t.name,
      description: t.description,
      trigger: t.trigger,
      action: undefined as never,
      flow,
      conditions,
      category: t.category,
      module: t.module,
      tags: [...t.tags, 'modelo'],
      manualMinutesSaved: t.manualMinutesSaved,
      departmentIds: dto.departmentIds,
      critical: dto.critical,
      draft: true,
      retryPolicy: 'FIXED',
      maxRetries: 2,
      retryDelayMinutes: 5,
      errorHandling: 'NOTIFY_OWNER',
      notes: `Criada a partir do modelo "${t.name}".${t.limitations.length ? ` Limitações: ${t.limitations.join(' ')}` : ''}`,
    };
    const created = await this.automation.createRule(rule, userId);
    const updated = await this.prisma.automationRule.update({
      where: { id: created.id },
      data: { templateKey: t.key },
    });
    await this.audit.record({
      entity: 'RULE',
      entityId: created.id,
      ruleId: created.id,
      action: 'AUTOMATION_FROM_TEMPLATE',
      userId,
      note: t.key,
      after: { values },
    });
    return {
      rule: updated,
      nextSteps: [
        'Reveja o fluxo e os destinatários',
        'Execute um teste (POST /automation/rules/:id/test)',
        'Publique para activar (POST /automation/rules/:id/publish)',
      ],
      limitations: t.limitations,
    };
  }
}
