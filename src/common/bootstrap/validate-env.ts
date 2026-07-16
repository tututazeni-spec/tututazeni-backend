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

  if (!env.APP_URL) {
    console.warn(
      '[BOOT] APP_URL não definido — links em documentos e declarações usarão o valor hardcoded.',
    );
  }

  if (!env.METRICS_TOKEN) {
    console.warn('[BOOT] METRICS_TOKEN não definido — endpoint /metrics pode estar desprotegido.');
  }

  if (!env.STORAGE_BASE_URL) {
    console.warn('[BOOT] STORAGE_BASE_URL não definido — URLs de DOCX podem falhar.');
  }
}
