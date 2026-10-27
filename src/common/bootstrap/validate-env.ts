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
    // Produção não pode herdar valores de teste/desenvolvimento (.env.test, defaults de exemplo):
    // são públicos no repositório.
    for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (/test-(refresh-)?secret|innova-2024|your_jwt_secret/i.test(env[name] ?? '')) {
        throw new Error(
          `[BOOT] ${name} tem um valor de teste/exemplo — usa um segredo exclusivo de produção.`,
        );
      }
    }
    if (
      /\/\/(postgres:postgres|admin:admin|root:root|postgres:password)@/i.test(
        env.DATABASE_URL ?? '',
      )
    ) {
      throw new Error(
        '[BOOT] DATABASE_URL usa credenciais por defeito (ex.: postgres:postgres) — cria um utilizador próprio.',
      );
    }
    // Menor privilégio: a app não se liga à BD com a conta administrativa (postgres/root/admin).
    for (const name of ['DATABASE_URL', 'DATABASE_APP_URL'] as const) {
      const user = /^[a-z]+:\/\/([^:@/]+)[:@]/i.exec(env[name] ?? '')?.[1];
      if (
        user &&
        /^(postgres|root|admin|administrator|superuser)$/i.test(decodeURIComponent(user))
      ) {
        throw new Error(
          `[BOOT] ${name} usa o utilizador administrativo "${user}" — cria uma role dedicada com permissões mínimas.`,
        );
      }
    }
    if (/localhost|127\.0\.0\.1/i.test(env.ALLOWED_ORIGINS ?? '')) {
      throw new Error('[BOOT] ALLOWED_ORIGINS em produção não pode incluir localhost.');
    }
    if (['Admin@1234', 'Employee@1234', 'LoadTest@2024'].includes(env.SEED_ADMIN_PASSWORD ?? '')) {
      throw new Error('[BOOT] SEED_ADMIN_PASSWORD é uma palavra-passe de teste conhecida.');
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
    if (env.RLS_ENABLED !== 'true') {
      bootWarn(
        'RLS_ENABLED não está true — a app corre com a role dona das tabelas, sem isolamento por linha (ver ops/db/rls/README.md).',
      );
    }
    if (!env.PII_ENCRYPTION_KEY) {
      bootWarn(
        'PII_ENCRYPTION_KEY não definido — NIF/NIB/IBAN e segredos cifrados derivam de JWT_SECRET; rodá-lo tornaria-os ilegíveis.',
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
