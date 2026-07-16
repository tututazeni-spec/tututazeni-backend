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

  // Runtime
  JWT_USER_CACHE_TTL_MS: Joi.number().default(30000),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  AUTH_ALLOW_BEARER: Joi.boolean().default(true),
}).options({ allowUnknown: true });
