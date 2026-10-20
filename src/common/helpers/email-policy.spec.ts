import {
  checkEmailAgainstPolicy,
  normalizeNamePart,
  suggestEmail,
  suggestEmailAlternatives,
  EmailPolicyConfig,
} from './email-policy';

const config: EmailPolicyConfig = {
  emailDomain: 'carrinho-sa.com',
  emailPattern: '{primeiroNome}.{apelido}',
  emailPolicyMode: 'ENFORCE',
};

describe('email-policy', () => {
  describe('normalizeNamePart', () => {
    it('remove acentos, maiúsculas e símbolos', () => {
      expect(normalizeNamePart('António')).toBe('antonio');
      expect(normalizeNamePart("D'Ávila-Çé")).toBe('davilace');
    });
  });

  describe('suggestEmail', () => {
    it('gera nome.apelido com o último nome', () => {
      expect(suggestEmail('António Miguel', 'carrinho-sa.com')).toBe(
        'antonio.miguel@carrinho-sa.com',
      );
      expect(suggestEmail('  maria   José  da Silva ', '@Carrinho-SA.com')).toBe(
        'maria.silva@carrinho-sa.com',
      );
    });

    it('usa só o primeiro nome quando não há apelido', () => {
      expect(suggestEmail('Madonna', 'carrinho-sa.com')).toBe('madonna@carrinho-sa.com');
    });

    it('devolve null para nome vazio', () => {
      expect(suggestEmail('   ', 'carrinho-sa.com')).toBeNull();
    });
  });

  describe('suggestEmailAlternatives', () => {
    it('propõe nome do meio e sufixo numérico, saltando os ocupados', () => {
      const taken = new Set(['antonio.miguel@carrinho-sa.com', 'antonio.miguel2@carrinho-sa.com']);
      const alts = suggestEmailAlternatives('António José Miguel', 'carrinho-sa.com', taken);
      expect(alts[0]).toBe('antonio.jose@carrinho-sa.com');
      expect(alts).toContain('antonio.miguel3@carrinho-sa.com');
      expect(alts).not.toContain('antonio.miguel2@carrinho-sa.com');
    });

    it('não propõe nada para nomes de uma só palavra', () => {
      expect(suggestEmailAlternatives('Madonna', 'carrinho-sa.com', new Set())).toEqual([]);
    });
  });

  describe('checkEmailAgainstPolicy', () => {
    it('aceita o formato correcto, com sufixo de homónimo', () => {
      expect(checkEmailAgainstPolicy('antonio.miguel@carrinho-sa.com', config)).toEqual([]);
      expect(checkEmailAgainstPolicy('antonio.miguel2@carrinho-sa.com', config)).toEqual([]);
    });

    it('rejeita domínio errado', () => {
      expect(checkEmailAgainstPolicy('antonio.miguel@gmail.com', config)[0]).toContain(
        '@carrinho-sa.com',
      );
    });

    it('rejeita maiúsculas e espaços', () => {
      const v = checkEmailAgainstPolicy('Antonio Miguel@carrinho-sa.com', config);
      expect(v.length).toBeGreaterThanOrEqual(2);
    });

    it('rejeita parte local sem ponto ou com acentos', () => {
      expect(checkEmailAgainstPolicy('antonio@carrinho-sa.com', config)).toHaveLength(1);
      expect(checkEmailAgainstPolicy('antónio.miguel@carrinho-sa.com', config)).toHaveLength(1);
    });

    it('não restringe tenants sem emailDomain', () => {
      expect(
        checkEmailAgainstPolicy('qualquer@coisa.pt', { ...config, emailDomain: null }),
      ).toEqual([]);
    });
  });
});
