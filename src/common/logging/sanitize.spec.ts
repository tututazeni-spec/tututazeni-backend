import { sanitizeForLog } from './sanitize';

describe('sanitizeForLog', () => {
  describe('valores primitivos', () => {
    it('null e undefined passam inalterados', () => {
      expect(sanitizeForLog(null)).toBeNull();
      expect(sanitizeForLog(undefined)).toBeUndefined();
    });

    it('números e booleanos passam inalterados', () => {
      expect(sanitizeForLog(42)).toBe(42);
      expect(sanitizeForLog(true)).toBe(true);
    });

    it('string comum sem padrão sensível passa inalterada', () => {
      expect(sanitizeForLog('mensagem normal')).toBe('mensagem normal');
    });
  });

  describe('máscara de email', () => {
    it('mascara o local-part mantendo os primeiros 2 caracteres', () => {
      expect(sanitizeForLog('joaosilva@innova.com')).toBe('jo*******@innova.com');
    });

    it('local-part de 1 carácter mostra pelo menos 1 asterisco', () => {
      expect(sanitizeForLog('a@innova.com')).toBe('a*@innova.com');
    });

    it('string com @ mas sem domínio válido (sem ponto) não é tratada como email', () => {
      expect(sanitizeForLog('user@localhost')).toBe('user@localhost');
    });
  });

  describe('detecção de JWT', () => {
    it('token com formato JWT (3 segmentos) e comprimento > 20 é redigido', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(sanitizeForLog(jwt)).toBe('[REDACTED]');
    });

    it('string curta com pontos não é confundida com JWT (guarda de comprimento)', () => {
      expect(sanitizeForLog('a.b.c')).toBe('a.b.c');
    });

    it('string com um único ponto não corresponde ao padrão JWT', () => {
      expect(sanitizeForLog('naoeh.umjwt')).toBe('naoeh.umjwt');
    });
  });

  describe('campos sensíveis por nome da chave (redacção total, sem inspeccionar o valor)', () => {
    const sensitiveKeys = [
      'password',
      'Senha',
      'token',
      'secret',
      'Authorization',
      'cookie',
      'nif',
      'NIB',
      'iban',
      'salary',
      'salário',
      'vencimento',
      'refreshToken',
      'accessToken',
      'cartao',
      'cartão',
      'ssn',
      'creditCard',
    ];

    it.each(sensitiveKeys)('redige o campo "%s" independentemente do valor', key => {
      const result = sanitizeForLog({ [key]: 'valor-super-secreto' }) as Record<string, unknown>;
      expect(result[key]).toBe('[REDACTED]');
    });

    it('não redige campos cujo nome não corresponde a nenhum padrão sensível', () => {
      const result = sanitizeForLog({ fullName: 'Ana Silva', age: 30 }) as Record<string, unknown>;
      expect(result.fullName).toBe('Ana Silva');
      expect(result.age).toBe(30);
    });

    it('redige mesmo quando o valor sensível é um objecto aninhado (não desce a inspeccioná-lo)', () => {
      const result = sanitizeForLog({
        password: { hash: 'abc', salt: 'xyz' },
      }) as Record<string, unknown>;
      expect(result.password).toBe('[REDACTED]');
    });
  });

  describe('recursão em objectos e arrays', () => {
    it('sanitiza recursivamente objectos aninhados', () => {
      const result = sanitizeForLog({
        user: { email: 'joaosilva@innova.com', password: 'segredo123' },
      }) as any;
      expect(result.user.email).toBe('jo*******@innova.com');
      expect(result.user.password).toBe('[REDACTED]');
    });

    it('sanitiza cada elemento de um array', () => {
      const result = sanitizeForLog([{ email: 'ab@x.com' }, { token: 'abc' }]) as any[];
      expect(result[0].email).toBe('ab*@x.com');
      expect(result[1].token).toBe('[REDACTED]');
    });
  });

  describe('protecção contra referências circulares', () => {
    it('substitui uma referência circular por [CIRCULAR] em vez de recursão infinita', () => {
      const obj: any = { name: 'x' };
      obj.self = obj;
      const result = sanitizeForLog(obj) as any;
      expect(result.self).toBe('[CIRCULAR]');
    });
  });

  describe('limite de profundidade', () => {
    it('trunca estruturas com mais de 6 níveis de profundidade', () => {
      const deep: any = {};
      let cursor = deep;
      for (let i = 0; i < 10; i++) {
        cursor.next = {};
        cursor = cursor.next;
      }
      const result = sanitizeForLog(deep) as any;
      let r = result;
      let depth = 0;
      while (r && typeof r === 'object' && r.next !== undefined) {
        r = r.next;
        depth++;
      }
      expect(r).toBe('[TRUNCATED]');
      expect(depth).toBeLessThanOrEqual(7);
    });
  });

  describe('objectos Error', () => {
    it('preserva name e stack; a detecção de email não extrai o endereço — mascara a frase inteira (comportamento actual, não ideal)', () => {
      const err = new Error('Falha ao autenticar joaosilva@innova.com');
      const result = sanitizeForLog(err) as any;
      expect(result.name).toBe('Error');
      // sanitizeValue() só verifica se a string TEM '@' e '.', não extrai o
      // endereço — por isso mascara a mensagem completa como se fosse email.
      expect(result.message).toBe('Fa***************************@innova.com');
      expect(result.stack).toBe(err.stack);
    });

    it('não expõe propriedades extra de um Error além de name/message/stack', () => {
      const err: any = new Error('erro');
      err.password = 'nao-deveria-aparecer';
      const result = sanitizeForLog(err) as any;
      expect(result).not.toHaveProperty('password');
      expect(Object.keys(result).sort()).toEqual(['message', 'name', 'stack']);
    });
  });
});
