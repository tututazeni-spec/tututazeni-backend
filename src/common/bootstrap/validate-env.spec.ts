import { validateEnv } from './validate-env';

const BASE = {
  JWT_SECRET: 'supersecret-key-with-more-than-32-chars!!',
  JWT_REFRESH_SECRET: 'another-refresh-secret-long-enough!!',
  ALLOWED_FILE_HOST: 'storage.innova.ao',
};

describe('validateEnv', () => {
  it('não lança com todas as vars obrigatórias definidas', () => {
    expect(() => validateEnv(BASE)).not.toThrow();
  });

  it('lança quando JWT_SECRET é o valor placeholder', () => {
    expect(() => validateEnv({ ...BASE, JWT_SECRET: 'your_jwt_secret' })).toThrow('JWT_SECRET');
  });

  it('lança quando JWT_SECRET está em falta', () => {
    const { JWT_SECRET, ...rest } = BASE;
    expect(() => validateEnv(rest as NodeJS.ProcessEnv)).toThrow('JWT_SECRET');
  });

  it('lança quando JWT_REFRESH_SECRET está em falta', () => {
    const { JWT_REFRESH_SECRET, ...rest } = BASE;
    expect(() => validateEnv(rest as NodeJS.ProcessEnv)).toThrow('JWT_REFRESH_SECRET');
  });

  it('lança quando ALLOWED_FILE_HOST está em falta', () => {
    const { ALLOWED_FILE_HOST, ...rest } = BASE;
    expect(() => validateEnv(rest as NodeJS.ProcessEnv)).toThrow('ALLOWED_FILE_HOST');
  });

  it('não lança mesmo com APP_URL em falta (apenas warn)', () => {
    expect(() => validateEnv(BASE)).not.toThrow();
  });

  describe('APP_URL em produção', () => {
    const PROD = { ...BASE, NODE_ENV: 'production' };

    it('lança quando falta', () => {
      expect(() => validateEnv(PROD)).toThrow('APP_URL');
    });

    it('lança quando é http://', () => {
      expect(() => validateEnv({ ...PROD, APP_URL: 'http://innova.ao' })).toThrow('https://');
    });

    it('aceita https://', () => {
      expect(() => validateEnv({ ...PROD, APP_URL: 'https://innova.ao' })).not.toThrow();
    });

    it('fora de produção não bloqueia', () => {
      expect(() => validateEnv({ ...BASE, APP_URL: 'http://localhost:3000' })).not.toThrow();
    });
  });
  describe('segredos placeholder em produção', () => {
    const PROD = { ...BASE, NODE_ENV: 'production', APP_URL: 'https://innova.ao' };

    it.each(['JWT_REFRESH_SECRET', 'SWAGGER_TOKEN', 'METRICS_TOKEN'])(
      'lança com %s=CHANGE_ME',
      name => {
        expect(() => validateEnv({ ...PROD, [name]: 'CHANGE_ME' })).toThrow(name);
      },
    );

    it('lança com SWAGGER_TOKEN=change-me-in-production', () => {
      expect(() => validateEnv({ ...PROD, SWAGGER_TOKEN: 'change-me-in-production' })).toThrow(
        'SWAGGER_TOKEN',
      );
    });

    it('fora de produção não bloqueia', () => {
      expect(() =>
        validateEnv({ ...BASE, SWAGGER_TOKEN: 'change-me-in-production' }),
      ).not.toThrow();
    });
  });

  describe('valores de teste/defeito em produção', () => {
    const PROD = { ...BASE, NODE_ENV: 'production', APP_URL: 'https://innova.ao' };

    it.each([
      ['JWT_SECRET', 'test-secret-key-innova-2024-must-be-long'],
      ['JWT_REFRESH_SECRET', 'test-refresh-secret-innova-2024-long'],
      ['DATABASE_URL', 'postgresql://postgres:postgres@db:5432/innova'],
      ['ALLOWED_ORIGINS', 'https://innova.ao,http://localhost:3000'],
      ['SEED_ADMIN_PASSWORD', 'Admin@1234'],
    ])('lança com %s de teste/defeito', (name, value) => {
      expect(() => validateEnv({ ...PROD, [name]: value })).toThrow(name);
    });

    it('fora de produção não bloqueia', () => {
      expect(() =>
        validateEnv({ ...BASE, DATABASE_URL: 'postgresql://postgres:postgres@localhost/x' }),
      ).not.toThrow();
    });
  });

  describe('UPLOAD_VALIDATION_MODE', () => {
    const captured = (env: NodeJS.ProcessEnv): string => {
      const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        validateEnv(env);
        return write.mock.calls.map(c => String(c[0])).join('');
      } finally {
        write.mockRestore();
      }
    };

    it('em modo warn avisa no arranque que há ficheiros suspeitos a ser aceites', () => {
      expect(captured({ ...BASE, UPLOAD_VALIDATION_MODE: 'warn' })).toContain(
        'UPLOAD_VALIDATION_MODE=warn',
      );
    });

    it('em enforce (ou sem definir) não avisa', () => {
      expect(captured({ ...BASE, UPLOAD_VALIDATION_MODE: 'enforce' })).not.toContain(
        'UPLOAD_VALIDATION_MODE',
      );
      expect(captured(BASE)).not.toContain('UPLOAD_VALIDATION_MODE');
    });
  });
});
