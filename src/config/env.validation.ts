import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  PORT: Joi.number().default(4000),

  // Base de dados
  DATABASE_URL: Joi.string().required(),

  // JWT — rejeita o placeholder do .env.example
  JWT_SECRET: Joi.string().min(32).disallow('your_jwt_secret').required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  // Upload e CORS
  ALLOWED_FILE_HOST: Joi.string().required(),
  ALLOWED_ORIGINS: Joi.string().required(),

  // URLs de infra
  APP_URL: Joi.string().uri().required(),
  METRICS_TOKEN: Joi.string().required(),
  STORAGE_BASE_URL: Joi.string().uri().optional(),

  // Swagger — obrigatório apenas em produção
  SWAGGER_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),

  // IA Tutor — opcionais (app funciona sem eles)
  AI_PROVIDER: Joi.string().valid('groq', 'gemini', 'ollama').optional(),
  GROQ_API_KEY: Joi.string().optional().allow(''),
  GROQ_MODEL: Joi.string().optional(),
  GEMINI_API_KEY: Joi.string().optional().allow(''),
  GEMINI_MODEL: Joi.string().optional(),
  OLLAMA_URL: Joi.string().uri().optional().allow(''),
  OLLAMA_MODEL: Joi.string().optional(),

  // Avatar de leitura (text-to-speech) — opcionais (app funciona sem eles;
  // GET /lessons/:id/audio devolve 503 se não configurados)
  ELEVENLABS_API_KEY: Joi.string().optional().allow(''),
  ELEVENLABS_VOICE_ID: Joi.string().optional().allow(''),

  // Runtime
  JWT_USER_CACHE_TTL_MS: Joi.number().default(30000),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  AUTH_ALLOW_BEARER: Joi.boolean().default(true),

  // Invalidação de sessão por inactividade (A10-24) — 30 min por omissão.
  // Um refresh token não usado há mais tempo do que isto é tratado como
  // sessão inactiva: a cadeia é revogada e o utilizador tem de voltar a
  // autenticar-se, mesmo que o refresh token ainda não tenha expirado.
  SESSION_IDLE_TIMEOUT_MS: Joi.number().default(1_800_000),

  // SMTP — opcionais (sem SMTP_HOST, emails não são enviados; app arranca na mesma)
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().optional().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional().default('INNOVA <noreply@innova.ao>'),
}).options({ allowUnknown: true });
