import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  PORT: Joi.number().default(4000),

  // Base de dados
  DATABASE_URL: Joi.string().required(),
  DATABASE_POOLER_URL: Joi.string().optional(),

  // JWT — rejeita o placeholder do .env.example
  JWT_SECRET: Joi.string().min(32).disallow('your_jwt_secret').required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  // Upload e CORS
  ALLOWED_FILE_HOST: Joi.string().required(),
  // enforce (omissão): recusa ficheiros cujo conteúdo real não bate com o tipo/estrutura esperados.
  // warn: só regista (rollout). Um valor inválido (ex.: "wran") falha o arranque em vez de passar
  // despercebido.
  UPLOAD_VALIDATION_MODE: Joi.string().valid('enforce', 'warn').default('enforce'),
  // Pedidos de upload por utilizador e por minuto (omissão: 20).
  UPLOAD_THROTTLE_LIMIT: Joi.number().integer().min(1).optional(),
  // Antivírus (ClamAV/clamd) sobre os ficheiros enviados. Desligado por omissão.
  CLAMAV_ENABLED: Joi.boolean().default(false),
  CLAMAV_HOST: Joi.string().optional(),
  CLAMAV_PORT: Joi.number().port().optional(),
  CLAMAV_TIMEOUT_MS: Joi.number().integer().min(1000).optional(),
  // open: clamd em baixo => o ficheiro passa (e fica registado); closed: o upload é recusado.
  CLAMAV_FAIL_MODE: Joi.string().valid('open', 'closed').default('open'),
  // Tamanho máximo de UMA sessão INSTREAM (≥ 1 MiB; tem de ser ≤ StreamMaxLength do clamd). Ficheiros
  // maiores são verificados em segmentos com sobreposição.
  CLAMAV_MAX_BYTES: Joi.number()
    .integer()
    .min(1024 * 1024)
    .optional(),
  // Verificação dos ficheiros guardados fora (fileUrl no storage): o backend descarrega-os (só do
  // host autorizado) e aplica tipo real, estrutura, conteúdo activo e antivírus. Desligado por omissão.
  REMOTE_FILE_VERIFY: Joi.boolean().default(false),
  REMOTE_FILE_MAX_BYTES: Joi.number()
    .integer()
    .min(1024 * 1024)
    .optional(),
  REMOTE_FILE_TIMEOUT_MS: Joi.number().integer().min(1000).optional(),
  // open: ficheiro inacessível/lento => passa e fica registado; closed: o registo é recusado.
  REMOTE_FILE_FAIL_MODE: Joi.string().valid('open', 'closed').default('open'),
  // Acima deste tamanho o ficheiro não é descarregado no pedido: é verificado em segundo plano.
  REMOTE_FILE_SYNC_MAX_BYTES: Joi.number()
    .integer()
    .min(1024 * 1024)
    .optional(),
  // Quanto tempo um veredicto fica em cache (a revalidação é um GET condicional / 304).
  REMOTE_FILE_CACHE_TTL_S: Joi.number().integer().min(60).optional(),
  // Varrimento periódico dos ficheiros já registados. Sem valor, acompanha REMOTE_FILE_VERIFY.
  REMOTE_FILE_SWEEP: Joi.boolean().optional(),
  REMOTE_FILE_SWEEP_CRON: Joi.string().optional(),
  REMOTE_FILE_SWEEP_MAX_PER_RUN: Joi.number().integer().min(1).optional(),
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

  // Pepper das senhas (HMAC antes do Argon2id) — obrigatório em produção: sem ele um dump
  // da BD bastaria para atacar as senhas offline.
  PASSWORD_PEPPER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(32).optional().allow(''),
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
  ELEVENLABS_MODEL_ID: Joi.string().optional().allow(''),

  // Avatar da Ísis (Simli) — opcionais; sem eles a Ísis usa imagem estática
  SIMLI_API_KEY: Joi.string().optional().allow(''),
  SIMLI_FACE_ID: Joi.string().optional().allow(''),
  SIMLI_ALLOWED_ROLES: Joi.string().optional().allow(''),
  SIMLI_MAX_SESSION_SECONDS: Joi.number().integer().min(30).default(600),
  SIMLI_MAX_IDLE_SECONDS: Joi.number().integer().min(30).default(180),

  // Runtime
  JWT_USER_CACHE_TTL_MS: Joi.number().default(30000),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  AUTH_ALLOW_BEARER: Joi.boolean().default(true),

  // Invalidação de sessão por inactividade (A10-24) — 30 min por omissão.
  // Um refresh token não usado há mais tempo do que isto é tratado como
  // sessão inactiva: a cadeia é revogada e o utilizador tem de voltar a
  // autenticar-se, mesmo que o refresh token ainda não tenha expirado.
  // 30 min (requisito de produto) — tem de ficar igual ao fallback interno
  // em auth.service.ts#sessionIdleTimeoutMs: o ConfigModule aplica este
  // default a process.env antes de qualquer handler correr, por isso é
  // este valor (não o fallback do próprio auth.service.ts) que rege em
  // runtime sempre que a env var não é definida explicitamente.
  SESSION_IDLE_TIMEOUT_MS: Joi.number().default(1_800_000),

  // SMTP — opcionais (sem SMTP_HOST, emails não são enviados; app arranca na mesma)
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().optional().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional().default('INNOVA <noreply@innova.ao>'),
}).options({ allowUnknown: true });
