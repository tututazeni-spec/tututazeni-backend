// src/settings/security-policy.ts
// Política de segurança (docs/modulo_settings.md §4) — guardada em
// TenantConfig.securityPolicyJson. Lógica pura: sem acesso à BD.
//
// O piso do projecto (A2-5, IsStrongPassword: ≥10 chars, minúscula + maiúscula +
// dígito) é validado nos DTOs e NÃO pode ser relaxado aqui — a política só o
// pode apertar (comprimento maior, símbolo obrigatório, expiração).

export const TWO_FACTOR_MODES = ['OPTIONAL', 'REQUIRED_PRIVILEGED', 'REQUIRED_ALL'] as const;
export type TwoFactorMode = (typeof TWO_FACTOR_MODES)[number];

export interface SecurityPolicy {
  /** Comprimento mínimo da palavra-passe (piso 10). */
  passwordMinLength: number;
  /** Exige pelo menos um símbolo (além do piso minúscula/maiúscula/dígito). */
  passwordRequireSymbol: boolean;
  /** Dias até a palavra-passe expirar (0 = nunca expira). */
  passwordExpiryDays: number;
  /** Tentativas falhadas consecutivas até bloquear a conta (0 = sem bloqueio). */
  maxFailedAttempts: number;
  /** Duração do bloqueio, em minutos. */
  lockoutMinutes: number;
  /** Inactividade (minutos) até a sessão expirar. */
  sessionIdleMinutes: number;
  /** Validade do access token (JWT), em minutos. */
  accessTokenMinutes: number;
  /** Validade do refresh token, em dias. */
  refreshTokenDays: number;
  /** 2FA: opcional, obrigatório para perfis privilegiados, ou para todos. */
  twoFactorMode: TwoFactorMode;
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  passwordMinLength: 10,
  passwordRequireSymbol: false,
  passwordExpiryDays: 0,
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  sessionIdleMinutes: 30,
  accessTokenMinutes: 15,
  refreshTokenDays: 7,
  twoFactorMode: 'OPTIONAL',
};

export function parseSecurityPolicy(raw: string | null | undefined): SecurityPolicy {
  if (!raw) return { ...DEFAULT_SECURITY_POLICY };
  try {
    return { ...DEFAULT_SECURITY_POLICY, ...(JSON.parse(raw) as Partial<SecurityPolicy>) };
  } catch {
    return { ...DEFAULT_SECURITY_POLICY };
  }
}

/** Violações (lista vazia = ok) de uma palavra-passe face à política. */
export function validatePasswordAgainstPolicy(policy: SecurityPolicy, password: string): string[] {
  const errors: string[] = [];
  if (password.length < policy.passwordMinLength) {
    errors.push(`A palavra-passe deve ter pelo menos ${policy.passwordMinLength} caracteres`);
  }
  if (policy.passwordRequireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('A palavra-passe deve incluir pelo menos um símbolo');
  }
  return errors;
}

/** A palavra-passe expirou? `changedAt` nulo = nunca trocada → conta desde `createdAt`. */
export function isPasswordExpired(
  policy: SecurityPolicy,
  changedAt: Date | null,
  createdAt: Date,
  now = Date.now(),
): boolean {
  if (policy.passwordExpiryDays <= 0) return false;
  const base = (changedAt ?? createdAt).getTime();
  return now > base + policy.passwordExpiryDays * 86_400_000;
}

/** O 2FA é obrigatório para este utilizador? */
export function isTwoFactorRequired(policy: SecurityPolicy, privileged: boolean): boolean {
  return (
    policy.twoFactorMode === 'REQUIRED_ALL' ||
    (policy.twoFactorMode === 'REQUIRED_PRIVILEGED' && privileged)
  );
}
