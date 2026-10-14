// src/process-standard/process-audit-trail.ts
// Lógica pura da aba "Histórico e Auditoria" (docs/Modulo_Processes.md §13):
// rótulos dos eventos, leitura segura do `meta` e CSV de exportação.

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATED: 'Modelo criado',
  UPDATED: 'Modelo actualizado',
  DELETED: 'Modelo eliminado',
  DUPLICATED: 'Modelo duplicado',
  ARCHIVED: 'Modelo arquivado',
  NEW_VERSION: 'Nova versão do modelo',
  SUBMITTED_FOR_REVIEW: 'Modelo submetido para revisão',
  APPROVE: 'Modelo aprovado',
  APPROVED: 'Modelo aprovado',
  REJECT: 'Modelo rejeitado',
  REJECTED: 'Modelo rejeitado',
  INSTANCE_STARTED: 'Processo iniciado',
  INSTANCE_UPDATED: 'Processo actualizado',
  INSTANCE_CANCELLED: 'Processo cancelado',
  INSTANCE_SUSPENDED: 'Processo suspenso',
  INSTANCE_RESUMED: 'Processo retomado',
  INSTANCE_ARCHIVED: 'Processo arquivado',
  INSTANCE_DUPLICATED: 'Processo duplicado',
  INSTANCE_REASSIGNED: 'Responsável alterado',
  INSTANCE_PRIORITY_CHANGED: 'Prioridade alterada',
  STEP_COMPLETED: 'Etapa concluída',
  STEP_REJECTED: 'Etapa rejeitada',
  STEP_REOPENED: 'Etapa reaberta',
  STEP_DEADLINE_CHANGED: 'Prazo da etapa alterado',
  STEP_AUTO_ESCALATED: 'Etapa escalada automaticamente',
  STEP_AUTO_FAILED: 'Etapa automática falhou',
  APPROVAL_REQUESTED: 'Aprovação pedida',
  APPROVAL_APPROVED: 'Aprovação concedida',
  APPROVAL_REJECTED: 'Aprovação rejeitada',
  APPROVAL_STEP_COMPLETED: 'Etapa de aprovação concluída',
  APPROVAL_AUTO_ESCALATED: 'Aprovação escalada automaticamente',
  EVENT_RECEIVED: 'Evento recebido',
  REPORT_EXPORTED: 'Relatório exportado',
  AUDIT_EXPORTED: 'Auditoria exportada',
  SETTING_UPDATED: 'Configuração alterada',
  SETTING_RESTORED: 'Configuração restaurada',
  INTEGRATION_EVENT_ACCEPTED: 'Evento de integração aceite',
  INTEGRATION_EVENT_FAILED: 'Evento de integração falhou',
  INTEGRATION_RETRY: 'Integração repetida',
  APPROVAL_DELEGATED: 'Aprovação delegada',
  APPROVAL_ESCALATED: 'Aprovação escalada',
  APPROVAL_INFO_PROVIDED: 'Informação fornecida para aprovação',
  APPROVAL_INFO_REQUESTED: 'Informação pedida para aprovação',
  APPROVAL_RETURNED: 'Aprovação devolvida',
  AUTOMATION_ASSIGNED: 'Responsável atribuído por automação',
  AUTOMATION_ESCALATED: 'Escalonamento por automação',
  AUTOMATION_PRIORITY_CHANGED: 'Prioridade alterada por automação',
  AUTOMATION_STEP_RETRIED: 'Etapa repetida por automação',
  DOCUMENT_APPROVED: 'Documento aprovado',
  DOCUMENT_ARCHIVED: 'Documento arquivado',
  DOCUMENT_ATTACHED: 'Documento anexado',
  DOCUMENT_GENERATED: 'Documento gerado',
  DOCUMENT_REJECTED: 'Documento rejeitado',
  DOCUMENT_REQUESTED: 'Documento solicitado',
  DOCUMENT_SIGNED: 'Documento assinado',
  DOCUMENT_SUBMITTED: 'Documento submetido',
  DOCUMENT_VERSION_ADDED: 'Nova versão do documento',
  STEP_AUTO_COMPLETED: 'Etapa concluída automaticamente',
  STEP_BLOCKED: 'Etapa bloqueada',
  STEP_CLARIFICATION_REQUESTED: 'Esclarecimento pedido na etapa',
  STEP_ESCALATED: 'Etapa escalada',
  STEP_REASSIGNED: 'Etapa reatribuída',
  STEP_REMINDER_SENT: 'Lembrete da etapa enviado',
  STEP_RETURNED: 'Etapa devolvida',
  STEP_SKIPPED: 'Etapa ignorada',
  STEP_STARTED: 'Etapa iniciada',
  STEP_UNBLOCKED: 'Etapa desbloqueada',
  process_start: 'Processo iniciado por automação',
  process_assign_responsible: 'Responsável atribuído por automação',
  process_retry_step: 'Etapa repetida por automação',
  send_notification: 'Notificação enviada',
};

export const auditActionLabel = (action: string) =>
  AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase();

/** Interpreta o `meta` (JSON em texto); nunca lança. */
export function parseAuditMeta(meta: string | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    const v: unknown = JSON.parse(meta);
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : { value: v };
  } catch {
    return { raw: meta.slice(0, 500) };
  }
}

const idOf = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
};

/** Referências a etapa / aprovação / documento guardadas no `meta`. */
export function auditRefs(meta: Record<string, unknown> | null) {
  const m = meta ?? {};
  return {
    stepId: idOf(m.stepId),
    approvalId: idOf(m.approvalId),
    documentId: idOf(m.processDocumentId ?? m.documentId),
  };
}

export function csvCell(v: unknown): string {
  let t = '';
  if (v instanceof Date) t = v.toISOString();
  else if (v !== null && v !== undefined) {
    t = typeof v === 'object' ? JSON.stringify(v) : String(v as string | number | boolean);
  }
  // Evita injecção de fórmulas ao abrir no Excel.
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return /[",;\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function toCsv(header: string[], rows: unknown[][]): Buffer {
  const body = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  return Buffer.from('﻿' + body, 'utf8');
}
