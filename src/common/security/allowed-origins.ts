// src/common/security/allowed-origins.ts
// CORS fail-fast (auditoria A-1, achado B4): em produção a lista é obrigatória
// e só aceita https:// — acabou o fallback silencioso para localhost.
export function parseAllowedOrigins(raw: string | undefined, isProd: boolean): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  if (!isProd) {
    return origins.length ? origins : ['http://localhost:3000'];
  }

  if (!origins.length) {
    throw new Error(
      'ALLOWED_ORIGINS é obrigatório em produção (lista separada por vírgulas, apenas origens https://)',
    );
  }

  const insecure = origins.filter(o => !o.startsWith('https://'));
  if (insecure.length) {
    throw new Error(
      `ALLOWED_ORIGINS em produção só aceita origens https:// — inválidas: ${insecure.join(', ')}`,
    );
  }

  return origins;
}
