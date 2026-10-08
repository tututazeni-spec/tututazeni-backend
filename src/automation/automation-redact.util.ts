// src/automation/automation-redact.util.ts
// §7 — o histórico mostra o resultado de cada etapa, mas nunca palavras-passe,
// tokens ou outros dados sensíveis (cabeçalhos de webhooks, payloads, etc.).

export const REDACTED = '***';

const SENSITIVE_KEY =
  /pass(word|wd)?|senha|secret|token|authorization|api[-_]?key|cookie|credential|private[-_]?key|iban|\bnib\b|\bnif\b|signature/i;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g;

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.replace(BEARER, `$1 ${REDACTED}`);
  if (typeof value !== 'object') return value;
  if (depth > 8) return REDACTED;
  if (Array.isArray(value)) return value.map(v => redactSensitive(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactSensitive(v, depth + 1);
  }
  return out;
}

/** JSON.parse tolerante + redacção; devolve null se vazio/inválido. */
export function parseRedacted(json?: string | null): unknown {
  if (!json) return null;
  try {
    return redactSensitive(JSON.parse(json));
  } catch {
    return null;
  }
}
