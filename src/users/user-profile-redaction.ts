import { CurrentUserData } from '../common/types/current-user';

// Papéis com visão completa de qualquer perfil (RH/gestão de pessoas/auditoria).
const FULL_PROFILE_ROLES = new Set(['ADMIN', 'RH', 'AUDITOR', 'DIRECTOR']);

/** Dados pessoais, financeiros e de contacto privado — nunca para colegas sem relação hierárquica. */
const SENSITIVE_FIELDS = [
  'phone',
  'birthDate',
  'gender',
  'nationality',
  'identificationNumber',
  'personalEmail',
  'alternatePhone',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'nif',
  'nib',
  'hireDate',
  'exitDate',
  'employeeNumber',
  'costCenter',
  'workSchedule',
  'username',
  'mfaEnabled',
  'contentAccessLevel',
  'hrStatus',
  'accountStatus',
] as const;

/** Listas de aprendizagem/equipa — mantêm-se como [] para o formato da resposta não mudar. */
const PRIVATE_COLLECTIONS = [
  'enrollments',
  'certificates',
  'userCompetencies',
  'badgeAwards',
  'subordinates',
] as const;

export function canSeeFullProfile(
  viewer: Pick<CurrentUserData, 'id'> & { role?: { name?: string } | null },
  target: { id: number; managerId?: number | null },
): boolean {
  if (viewer.id === target.id) return true;
  if (viewer.role?.name && FULL_PROFILE_ROLES.has(viewer.role.name)) return true;
  return target.managerId != null && target.managerId === viewer.id; // chefe direto
}

/** Perfil "de cartão": identidade profissional sem dados pessoais nem de aprendizagem. */
export function redactUserProfile<T extends object>(user: T): T {
  const out: Record<string, unknown> = { ...(user as Record<string, unknown>) };
  for (const k of SENSITIVE_FIELDS) delete out[k];
  for (const k of PRIVATE_COLLECTIONS) if (k in out) out[k] = [];
  return out as T;
}
