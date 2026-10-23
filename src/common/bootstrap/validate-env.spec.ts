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
});
