// src/process-standard/process-start-requirements.ts
// Dados que o modal «Novo Processo» tem de recolher conforme o módulo de origem
// (docs/Modulo_Processes.md §19: «colaborador, departamento, curso, documento ou
// pedido de origem»). Partilhado entre a API de requisitos e a validação ao iniciar.

export interface StartRequirements {
  /** Exige colaborador-alvo explícito (perfis de gestão; os restantes são o próprio). */
  collaborator: boolean;
  /** Tipo da entidade de origem obrigatória (ex.: «Curso»), ou null se não exigida. */
  entityType: string | null;
}

const COLLABORATOR_MODULES = [
  'Users',
  'Onboarding',
  'Payroll',
  'Leave',
  'Attendance',
  'Performance',
  'PDI',
  'Career',
];

const ENTITY_BY_MODULE: Record<string, string> = {
  Courses: 'Curso',
  Trainings: 'Formação',
  Enrollments: 'Curso',
  Documentos: 'Documento',
  Events: 'Evento',
  Departments: 'Departamento',
  Organization: 'Departamento',
};

export function startRequirements(sourceModule: string | null | undefined): StartRequirements {
  const m = sourceModule?.trim() ?? '';
  return {
    collaborator: COLLABORATOR_MODULES.includes(m),
    entityType: ENTITY_BY_MODULE[m] ?? null,
  };
}

/** Lista as faltas de dados obrigatórios (vazia = pode iniciar). */
export function missingStartData(
  req: StartRequirements,
  data: { targetUserId?: number; sourceEntityId?: string; actorIsManager: boolean },
): string[] {
  const missing: string[] = [];
  if (req.collaborator && data.actorIsManager && data.targetUserId == null) {
    missing.push('colaborador');
  }
  if (req.entityType && !data.sourceEntityId?.trim()) {
    missing.push(`identificador de ${req.entityType.toLowerCase()}`);
  }
  return missing;
}
