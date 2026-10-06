// src/settings/audit-data-settings.service.ts
// Separador «Auditoria e Dados» (docs/modulo_settings.md §10). O módulo de
// Auditoria (src/audit) já implementa tudo o que este separador precisa
// (registo de logs, exportação, política, saúde) — este serviço é só uma
// vista agregada para o resumo da página de Definições; a consulta/edição
// detalhada continua em /audit/*.
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuditPolicyService } from '../audit/audit-policy.service';

@Injectable()
export class AuditDataSettingsService {
  constructor(
    private readonly audit: AuditService,
    private readonly policy: AuditPolicyService,
  ) {}

  async overview() {
    const [status, policyView, overview] = await Promise.all([
      this.policy.getStatus(),
      this.policy.getPolicy(),
      this.audit.getOverview(7),
    ]);
    return {
      health: status.health,
      serviceEnabled: status.serviceEnabled,
      lastEventAt: status.lastEventAt,
      events24h: status.events24h,
      failedOperations24h: status.failedOperations24h,
      deniedOperations24h: status.deniedOperations24h,
      totalEvents7d: overview.totals?.events ?? null,
      backup: status.backup,
      exports: status.exports,
      policy: {
        coveredModules: policyView.coveredModules,
        requiredEvents: policyView.requiredEvents,
        viewRoles: policyView.viewRoles,
        exportRoles: policyView.exportRoles,
        retentionDays: policyView.retentionDays,
        archivePolicy: policyView.archivePolicy,
        maskSensitive: policyView.maskSensitive,
        updatedAt: policyView.updatedAt,
      },
      // Páginas reais do frontend (módulo de Auditoria) onde cada bloco se
      // aprofunda — não os endpoints da API (ver docs/modulo_audit.md).
      links: {
        logs: '/audit?view=logs',
        exports: '/audit?view=exports',
        policy: '/audit?view=policies',
      },
    };
  }
}
