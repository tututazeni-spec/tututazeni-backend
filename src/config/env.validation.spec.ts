import { envValidationSchema } from './env.validation';

function validate(env: Record<string, unknown>) {
  return envValidationSchema.validate(env, { abortEarly: false, allowUnknown: true });
}

const VALID_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/innova',
  JWT_SECRET: 'supersecret-key-with-more-than-32-chars!!',
  JWT_REFRESH_SECRET: 'another-refresh-secret-long-enough!!',
  ALLOWED_FILE_HOST: 'storage.innova.ao',
  ALLOWED_ORIGINS: 'https://innova.ao',
  APP_URL: 'https://innova.ao',
  METRICS_TOKEN: 'metrics-token-value',
};

describe('envValidationSchema', () => {
  it('aceita um .env válido completo', () => {
    const { error } = validate(VALID_ENV);
    expect(error).toBeUndefined();
  });

  it('rejeita JWT_SECRET em falta', () => {
    const { JWT_SECRET, ...rest } = VALID_ENV;
    const { error } = validate(rest);
    expect(error?.details.map(d => d.context?.key)).toContain('JWT_SECRET');
  });

  it('rejeita JWT_SECRET com valor placeholder', () => {
    const { error } = validate({ ...VALID_ENV, JWT_SECRET: 'your_jwt_secret' });
    expect(error?.details.map(d => d.context?.key)).toContain('JWT_SECRET');
  });

  it('rejeita JWT_SECRET com menos de 32 caracteres', () => {
    const { error } = validate({ ...VALID_ENV, JWT_SECRET: 'curta' });
    expect(error?.details.map(d => d.context?.key)).toContain('JWT_SECRET');
  });

  it('rejeita DATABASE_URL em falta', () => {
    const { DATABASE_URL, ...rest } = VALID_ENV;
    const { error } = validate(rest);
    expect(error?.details.map(d => d.context?.key)).toContain('DATABASE_URL');
  });

  it('rejeita APP_URL em falta', () => {
    const { APP_URL, ...rest } = VALID_ENV;
    const { error } = validate(rest);
    expect(error?.details.map(d => d.context?.key)).toContain('APP_URL');
  });

  it('rejeita APP_URL com valor não-URI', () => {
    const { error } = validate({ ...VALID_ENV, APP_URL: 'nao-uma-uri' });
    expect(error?.details.map(d => d.context?.key)).toContain('APP_URL');
  });

  it('exige SWAGGER_TOKEN apenas em NODE_ENV=production', () => {
    const prodEnv = { ...VALID_ENV, NODE_ENV: 'production' };
    const { error: errSemToken } = validate(prodEnv);
    expect(errSemToken?.details.map(d => d.context?.key)).toContain('SWAGGER_TOKEN');

    const { error: errComToken } = validate({ ...prodEnv, SWAGGER_TOKEN: 'tok' });
    expect(errComToken).toBeUndefined();
  });

  it('aceita SWAGGER_TOKEN em falta em development', () => {
    const devEnv = { ...VALID_ENV, NODE_ENV: 'development' };
    const { error } = validate(devEnv);
    expect(error).toBeUndefined();
  });

  it('aceita variáveis extra desconhecidas (allowUnknown)', () => {
    const { error } = validate({ ...VALID_ENV, QUALQUER_VARIAVEL_NOVA: 'valor' });
    expect(error).toBeUndefined();
  });

  it('aplica default NODE_ENV=development quando omitido', () => {
    const { value } = validate(VALID_ENV);
    expect(value.NODE_ENV).toBe('development');
  });

  it('aplica default PORT=4000 quando omitido', () => {
    const { value } = validate(VALID_ENV);
    expect(value.PORT).toBe(4000);
  });

  it('reporta todas as violações com abortEarly:false', () => {
    const { error } = validate({});
    // DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ALLOWED_FILE_HOST, ALLOWED_ORIGINS, APP_URL, METRICS_TOKEN
    expect(error?.details.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
