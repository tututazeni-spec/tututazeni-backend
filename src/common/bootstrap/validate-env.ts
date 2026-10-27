// Corre antes do NestFactory.create() — não há logger injectado ainda. Emite
// JSON diretamente para stdout para que estes avisos também sejam agregáveis
// (mesmo formato que os logs do pino) em vez de texto solto de console.warn.
function bootWarn(message: string): void {
  process.stdout.write(
    `${JSON.stringify({ level: 40, time: Date.now(), context: 'Bootstrap', msg: message })}\n`,
  );
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const { JWT_SECRET, JWT_REFRESH_SECRET, ALLOWED_FILE_HOST } = env;

  if (!JWT_SECRET || JWT_SECRET === 'your_jwt_secret') {
    throw new Error(
      '[BOOT] JWT_SECRET não está definido ou ainda tem o valor placeholder. ' +
        'Define uma chave forte (mínimo 32 caracteres) no ficheiro .env de produção.',
    );
  }

  if (!JWT_REFRESH_SECRET) {
    throw new Error('[BOOT] JWT_REFRESH_SECRET não está definido no ficheiro .env.');
  }

  if (!ALLOWED_FILE_HOST) {
    throw new Error(
      '[BOOT] ALLOWED_FILE_HOST não está definido. ' + 'Ex: ALLOWED_FILE_HOST=storage.innova.ao',
    );
  }

  if (env.NODE_ENV === 'production') {
    // Links de certificados/QR, reset de senha e declarações são gerados a partir
    // daqui: um fallback http://localhost ou um http:// real seria um downgrade.
    if (!env.APP_URL?.startsWith('https://')) {
      throw new Error('[BOOT] APP_URL é obrigatório em produção e tem de começar por https://');
    }

    // Placeholders dos ficheiros de exemplo (`CHANGE_ME`, `change-me-in-production`) em produção
    // são segredos públicos: quem leu o repositório forja tokens ou abre o Swagger/métricas.
    for (const name of [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'SWAGGER_TOKEN',
      'METRICS_TOKEN',
    ] as const) {
      if (/^change[-_]?me/i.test(env[name] ?? '')) {
        throw new Error(`[BOOT] ${name} ainda tem o valor placeholder — define um segredo forte.`);
      }
    }
    // Só avisam (não bloqueiam): um deploy existente com segredos curtos não pode deixar de arrancar.
    if (JWT_SECRET.length < 32) {
      bootWarn('JWT_SECRET tem menos de 32 caracteres — gerar com `openssl rand -base64 48`.');
    }
    if (JWT_SECRET === JWT_REFRESH_SECRET) {
      bootWarn(
        'JWT_SECRET e JWT_REFRESH_SECRET são iguais — um token de acesso valeria como refresh.',
      );
    }
    if (!env.REDIS_PASSWORD) {
      bootWarn('REDIS_PASSWORD não definido — Redis (filas, throttler, cache) sem autenticação.');
    }
  } else if (!env.APP_URL) {
    bootWarn('APP_URL não definido — links em documentos e declarações usarão o valor hardcoded.');
  }

  if (
    String(env.UPLOAD_VALIDATION_MODE ?? '')
      .trim()
      .toLowerCase() === 'warn'
  ) {
    bootWarn(
      'UPLOAD_VALIDATION_MODE=warn: ficheiros com conteúdo suspeito (executáveis, HTML/SVG, ' +
        'PDF com JavaScript, macros) estão a ser ACEITES e apenas registados. ' +
        'Passar a enforce no fim do rollout.',
    );
  }

  if (!env.METRICS_TOKEN) {
    bootWarn('METRICS_TOKEN não definido — endpoint /metrics pode estar desprotegido.');
  }

  if (!env.STORAGE_BASE_URL) {
    bootWarn('STORAGE_BASE_URL não definido — URLs de DOCX podem falhar.');
  }
}
