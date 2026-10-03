// src/automation/automation-failure.util.ts
// Classificação das falhas (§7) — partilhada sem dependências circulares.

/** Código estável do erro (§7) — o texto livre da mensagem não serve para filtrar. */
export function failureCode(message: string | null | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'UNKNOWN';
  if (/forbidden|permiss|unauthori|403|401/.test(m)) return 'PERMISSION_DENIED';
  if (/not found|não encontrad|nao encontrad|404/.test(m)) return 'RECORD_NOT_FOUND';
  if (/valid|inválid|invalid|obrigat/.test(m)) return 'VALIDATION_ERROR';
  if (/timeout|econn|network|fetch|socket|enotfound/.test(m)) return 'NETWORK_ERROR';
  if (/mail|smtp|sms|entrega|deliver/.test(m)) return 'DELIVERY_ERROR';
  return 'ACTION_FAILED';
}

export function classifyFailure(message: string | null): string {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'Sem detalhe';
  if (/forbidden|permiss|unauthori|403|401/.test(m)) return 'Permissões';
  if (/not found|não encontrad|nao encontrad|404/.test(m)) return 'Registo não encontrado';
  if (/valid|inválid|invalid|obrigat/.test(m)) return 'Validação de dados';
  if (/timeout|econn|network|fetch|socket|enotfound/.test(m)) return 'Rede / tempo limite';
  if (/mail|smtp|sms|entrega|deliver/.test(m)) return 'Entrega de comunicação';
  return 'Outros';
}
