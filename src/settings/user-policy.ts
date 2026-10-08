// src/settings/user-policy.ts
// Política de utilizadores (docs/modulo_settings.md §3) — guardada em
// TenantConfig.userPolicyJson. Lógica pura: sem acesso à BD.

export const POLICY_REQUIRED_FIELD_OPTIONS = [
  'phone',
  'birthDate',
  'gender',
  'employeeNumber',
  'departmentId',
  'positionId',
  'hireDate',
  'nif',
  'address',
  'roleId',
] as const;

export type PolicyRequiredField = (typeof POLICY_REQUIRED_FIELD_OPTIONS)[number];

export interface UserPolicy {
  /** Campos que têm de vir preenchidos na criação/convite de um utilizador. */
  requiredFields: PolicyRequiredField[];
  /** Se não vazio, só emails destes domínios podem ser criados/convidados. */
  allowedEmailDomains: string[];
  /** Função atribuída quando a criação não indica `roleId`. */
  defaultRoleId: number | null;
  /** Permite o fluxo POST /users/invite. */
  invitesEnabled: boolean;
  /** Validade (dias) do convite — informativo para o email de convite. */
  invitationExpiryDays: number;
  /** Obriga a trocar a palavra-passe temporária no primeiro login. */
  forcePasswordChangeOnFirstLogin: boolean;
  /** Dias sem login a partir dos quais um utilizador conta como inactivo. */
  inactiveAfterDays: number;
}

export const DEFAULT_USER_POLICY: UserPolicy = {
  requiredFields: [],
  allowedEmailDomains: [],
  defaultRoleId: null,
  invitesEnabled: true,
  invitationExpiryDays: 7,
  forcePasswordChangeOnFirstLogin: true,
  inactiveAfterDays: 90,
};

export function parseUserPolicy(raw: string | null | undefined): UserPolicy {
  if (!raw) return { ...DEFAULT_USER_POLICY };
  try {
    const parsed = JSON.parse(raw) as Partial<UserPolicy>;
    return { ...DEFAULT_USER_POLICY, ...parsed };
  } catch {
    return { ...DEFAULT_USER_POLICY };
  }
}

/** Devolve a lista de violações (vazia = ok) para um payload de criação/convite. */
export function validateAgainstPolicy(
  policy: UserPolicy,
  payload: Record<string, unknown> & { email?: string },
): string[] {
  const errors: string[] = [];

  for (const field of policy.requiredFields) {
    const value = payload[field];
    if (value === undefined || value === null || value === '') {
      errors.push(`Campo obrigatório pela política da organização: ${field}`);
    }
  }

  if (policy.allowedEmailDomains.length > 0 && payload.email) {
    const domain = payload.email.split('@')[1]?.toLowerCase() ?? '';
    const allowed = policy.allowedEmailDomains.map(d => d.toLowerCase());
    if (!allowed.includes(domain)) {
      errors.push(`Domínio de email não autorizado: ${domain || payload.email}`);
    }
  }

  return errors;
}
