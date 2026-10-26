// src/common/security/security-headers.ts
// Configuração única do helmet, partilhada por main.ts e pelo spec de headers
// (auditoria A-1). HSTS coerente com o emitido pela borda Caddy.
import helmet from 'helmet';

export function buildHelmet() {
  return helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    // Explícitos (já são o default do helmet) para ficarem cobertos pelo spec.
    // X-XSS-Protection: 0 de propósito — o filtro legado dos browsers cria
    // vulnerabilidades; a defesa real é a CSP + escape de output.
    xXssProtection: true,
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'no-referrer' },
  });
}
