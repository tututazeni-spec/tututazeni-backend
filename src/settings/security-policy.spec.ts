import {
  DEFAULT_SECURITY_POLICY,
  SecurityPolicy,
  isPasswordExpired,
  isTwoFactorRequired,
  parseSecurityPolicy,
  validatePasswordAgainstPolicy,
} from './security-policy';

const policy = (over: Partial<SecurityPolicy> = {}): SecurityPolicy => ({
  ...DEFAULT_SECURITY_POLICY,
  ...over,
});

describe('security-policy', () => {
  describe('parseSecurityPolicy', () => {
    it.each([null, undefined, ''])('devolve os valores por omissão para %p', raw => {
      expect(parseSecurityPolicy(raw)).toEqual(DEFAULT_SECURITY_POLICY);
    });

    it('devolve uma cópia — alterar o resultado não contamina os defaults', () => {
      const p = parseSecurityPolicy(null);
      p.maxFailedAttempts = 99;
      expect(DEFAULT_SECURITY_POLICY.maxFailedAttempts).toBe(5);
    });

    it('JSON inválido cai nos defaults em vez de lançar', () => {
      expect(parseSecurityPolicy('{not json')).toEqual(DEFAULT_SECURITY_POLICY);
    });

    it('sobrepõe apenas os campos presentes', () => {
      const p = parseSecurityPolicy(
        JSON.stringify({ lockoutMinutes: 60, twoFactorMode: 'REQUIRED_ALL' }),
      );
      expect(p.lockoutMinutes).toBe(60);
      expect(p.twoFactorMode).toBe('REQUIRED_ALL');
      expect(p.maxFailedAttempts).toBe(DEFAULT_SECURITY_POLICY.maxFailedAttempts);
    });
  });

  describe('validatePasswordAgainstPolicy', () => {
    it('aceita uma palavra-passe que cumpre comprimento e símbolo', () => {
      expect(
        validatePasswordAgainstPolicy(policy({ passwordRequireSymbol: true }), 'Abcdefgh1!'),
      ).toEqual([]);
    });

    it('rejeita palavra-passe abaixo do comprimento mínimo', () => {
      const errors = validatePasswordAgainstPolicy(policy({ passwordMinLength: 12 }), 'Abcdefgh1');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('12');
    });

    it('só exige símbolo quando a política o pede', () => {
      expect(validatePasswordAgainstPolicy(policy(), 'Abcdefgh12')).toEqual([]);
      expect(
        validatePasswordAgainstPolicy(policy({ passwordRequireSymbol: true }), 'Abcdefgh12'),
      ).toHaveLength(1);
    });

    it('acumula todas as violações', () => {
      const errors = validatePasswordAgainstPolicy(
        policy({ passwordMinLength: 12, passwordRequireSymbol: true }),
        'abc',
      );
      expect(errors).toHaveLength(2);
    });
  });

  describe('isPasswordExpired', () => {
    const day = 86_400_000;
    const created = new Date('2026-01-01T00:00:00Z');
    const changed = new Date('2026-03-01T00:00:00Z');

    it('nunca expira com passwordExpiryDays <= 0', () => {
      expect(isPasswordExpired(policy({ passwordExpiryDays: 0 }), null, created)).toBe(false);
      expect(isPasswordExpired(policy({ passwordExpiryDays: -5 }), null, created)).toBe(false);
    });

    it('conta desde passwordChangedAt quando existe', () => {
      const p = policy({ passwordExpiryDays: 30 });
      expect(isPasswordExpired(p, changed, created, changed.getTime() + 30 * day)).toBe(false);
      expect(isPasswordExpired(p, changed, created, changed.getTime() + 30 * day + 1)).toBe(true);
    });

    it('conta desde createdAt quando a palavra-passe nunca foi trocada', () => {
      const p = policy({ passwordExpiryDays: 30 });
      expect(isPasswordExpired(p, null, created, created.getTime() + 31 * day)).toBe(true);
      expect(isPasswordExpired(p, null, created, created.getTime() + 29 * day)).toBe(false);
    });
  });

  describe('isTwoFactorRequired', () => {
    it.each([
      ['OPTIONAL', true, false],
      ['OPTIONAL', false, false],
      ['REQUIRED_PRIVILEGED', true, true],
      ['REQUIRED_PRIVILEGED', false, false],
      ['REQUIRED_ALL', true, true],
      ['REQUIRED_ALL', false, true],
    ] as const)('modo %s, privilegiado=%s → %s', (twoFactorMode, privileged, expected) => {
      expect(isTwoFactorRequired(policy({ twoFactorMode }), privileged)).toBe(expected);
    });
  });
});
