// Rótulos em português para os enums usados nas exportações (CSV/PDF) do
// Plano de Formação. Espelham frontend/components/trainings/constants.ts.

export const TRAINING_STATUS_PT: Record<string, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  ARCHIVED: 'Arquivada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Concluída',
};

export const TRAINING_TYPE_PT: Record<string, string> = {
  PRESENTIAL: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrido',
  VIRTUAL_ROOM: 'Sala virtual',
  ELEARNING: 'E-learning',
  WORKSHOP: 'Workshop',
  SEMINAR: 'Seminário',
  COACHING: 'Coaching',
  MENTORING: 'Mentoria',
};

export const PLAN_STATUS_PT: Record<string, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Submetido',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};

export const PRIORITY_PT: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const PLAN_PERIOD_PT: Record<string, string> = {
  ANNUAL: 'Anual',
  SEMIANNUAL: 'Semestral',
  QUARTERLY: 'Trimestral',
  EXTRAORDINARY: 'Extraordinário',
};

/** Traduz um valor de enum; devolve o valor original se não houver rótulo. */
export function pt(map: Record<string, string>, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return map[String(value)] ?? String(value);
}
