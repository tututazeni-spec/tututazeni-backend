const SENSITIVE_KEY_PATTERN =
  /password|senha|token|secret|authorization|cookie|nif|nib|iban|salary|sal[aá]rio|vencimento|refreshtoken|accesstoken|cartao|cart[aã]o|ssn|creditcard/i;

const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

const REDACTED = '[REDACTED]';

function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return value;
  const local = value.slice(0, at);
  const domain = value.slice(at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 1))}${domain}`;
}

function sanitizeValue(value: string): string {
  if (JWT_PATTERN.test(value) && value.length > 20) return REDACTED;
  if (value.includes('@') && value.includes('.')) return maskEmail(value);
  return value;
}

/**
 * Mascara recursivamente campos sensíveis antes de um objecto ir para o logger.
 * Complementa o `redact` do pino (que só cobre paths fixos de req/res) — usar
 * sempre que se loga um objecto arbitrário (DTO, erro de API externa, payload de terceiros).
 */
export function sanitizeForLog(input: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (input === null || input === undefined) return input;
  if (depth > 6) return '[TRUNCATED]';

  if (typeof input === 'string') return sanitizeValue(input);
  if (typeof input !== 'object') return input;

  if (seen.has(input as object)) return '[CIRCULAR]';
  seen.add(input as object);

  if (input instanceof Error) {
    return {
      name: input.name,
      message: sanitizeValue(input.message),
      stack: input.stack,
    };
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeForLog(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = REDACTED;
      continue;
    }
    output[key] = sanitizeForLog(value, depth + 1, seen);
  }
  return output;
}

// `err`/`req`/`res` têm serializers próprios do pino (e `req`/`res` o `redact`);
// converter um Error em objecto simples antes deles correrem perderia o `type`/stack.
const PINO_NATIVE_KEYS = new Set(['err', 'error', 'req', 'res']);

/**
 * Rede de segurança global: aplicada pelo pino (`formatters.log`) a TODO objecto
 * logado, para que nenhum `logger.warn({ email, token, ... })` vaze dados sensíveis
 * mesmo que o autor da chamada se esqueça de chamar `sanitizeForLog`.
 */
export function sanitizeLogObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) out[key] = REDACTED;
    else if (PINO_NATIVE_KEYS.has(key) || value instanceof Error) out[key] = value;
    else out[key] = sanitizeForLog(value);
  }
  return out;
}
