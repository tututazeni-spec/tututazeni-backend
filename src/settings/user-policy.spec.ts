import {
  DEFAULT_USER_POLICY,
  UserPolicy,
  parseUserPolicy,
  validateAgainstPolicy,
} from './user-policy';

const policy = (over: Partial<UserPolicy> = {}): UserPolicy => ({
  ...DEFAULT_USER_POLICY,
  ...over,
});

describe('user-policy', () => {
  describe('parseUserPolicy', () => {
    it.each([null, undefined, ''])('devolve defaults para %p', raw => {
      expect(parseUserPolicy(raw)).toEqual(DEFAULT_USER_POLICY);
    });

    it('JSON inválido cai nos defaults', () => {
      expect(parseUserPolicy('{oops')).toEqual(DEFAULT_USER_POLICY);
    });

    it('sobrepõe apenas os campos guardados', () => {
      const p = parseUserPolicy(JSON.stringify({ invitesEnabled: false, inactiveAfterDays: 30 }));
      expect(p.invitesEnabled).toBe(false);
      expect(p.inactiveAfterDays).toBe(30);
      expect(p.invitationExpiryDays).toBe(DEFAULT_USER_POLICY.invitationExpiryDays);
    });
  });

  describe('validateAgainstPolicy', () => {
    it('sem restrições, qualquer payload passa', () => {
      expect(validateAgainstPolicy(policy(), { email: 'a@b.com' })).toEqual([]);
    });

    it('exige campos obrigatórios; undefined, null e "" contam como em falta', () => {
      const errors = validateAgainstPolicy(
        policy({ requiredFields: ['phone', 'nif', 'address'] }),
        { email: 'a@b.com', phone: '', nif: null },
      );
      expect(errors).toHaveLength(3);
      expect(errors.join(' ')).toMatch(/phone/);
      expect(errors.join(' ')).toMatch(/nif/);
      expect(errors.join(' ')).toMatch(/address/);
    });

    it('trata 0 e false como valores preenchidos', () => {
      expect(
        validateAgainstPolicy(policy({ requiredFields: ['departmentId', 'roleId'] }), {
          departmentId: 0,
          roleId: false,
        }),
      ).toEqual([]);
    });

    it('restringe o domínio do email, sem distinguir maiúsculas', () => {
      const p = policy({ allowedEmailDomains: ['Innova.com'] });
      expect(validateAgainstPolicy(p, { email: 'ana@INNOVA.COM' })).toEqual([]);
      expect(validateAgainstPolicy(p, { email: 'ana@evil.com' })).toHaveLength(1);
    });

    it('não confunde subdomínios nem sufixos com o domínio autorizado', () => {
      const p = policy({ allowedEmailDomains: ['innova.com'] });
      expect(validateAgainstPolicy(p, { email: 'x@sub.innova.com' })).toHaveLength(1);
      expect(validateAgainstPolicy(p, { email: 'x@innova.com.evil.io' })).toHaveLength(1);
    });

    it('email sem "@" é reportado como domínio não autorizado', () => {
      const errors = validateAgainstPolicy(policy({ allowedEmailDomains: ['innova.com'] }), {
        email: 'sem-arroba',
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('sem-arroba');
    });

    it('não valida o domínio quando não há email no payload', () => {
      expect(validateAgainstPolicy(policy({ allowedEmailDomains: ['innova.com'] }), {})).toEqual(
        [],
      );
    });
  });
});
