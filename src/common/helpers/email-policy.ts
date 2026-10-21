// Formato de email por tenant (docs/innova-formato-email-carrinho-sa.md).
// Funções puras — a leitura da configuração e a decisão ENFORCE/SUGGEST ficam no UsersService.

export type EmailPolicyModeValue = 'SUGGEST' | 'ENFORCE';

export interface EmailPolicyConfig {
  emailDomain: string | null;
  emailPattern: string;
  emailPolicyMode: EmailPolicyModeValue;
}

/** Minúsculas, sem acentos, só [a-z0-9]. */
export function normalizeNamePart(part: string): string {
  return part
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function nameTokens(fullName: string): string[] {
  return fullName
    .split(/\s+/)
    .map(normalizeNamePart)
    .filter(t => t.length > 0);
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, '');
}

/** `primeiroNome.apelido@domínio` — apelido = último nome (critério por omissão, ver A7). */
export function suggestEmail(fullName: string, domain: string): string | null {
  const tokens = nameTokens(fullName);
  if (tokens.length === 0) return null;
  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : null;
  return `${last ? `${first}.${last}` : first}@${normalizeDomain(domain)}`;
}

/**
 * Alternativas para homónimos: sufixo numérico e nome do meio.
 * Nunca escolhe — quem decide é o Admin.
 */
export function suggestEmailAlternatives(
  fullName: string,
  domain: string,
  taken: ReadonlySet<string>,
  max = 4,
): string[] {
  const tokens = nameTokens(fullName);
  if (tokens.length < 2) return [];
  const d = normalizeDomain(domain);
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const out: string[] = [];
  const push = (local: string) => {
    const email = `${local}@${d}`;
    if (!taken.has(email) && !out.includes(email)) out.push(email);
  };
  // Nome do meio: primeiro.meio.último não cabe no padrão, por isso usa-se primeiro.meio e meio.último.
  for (const middle of tokens.slice(1, -1)) push(`${first}.${middle}`);
  for (let n = 2; out.length < max && n < 20; n++) push(`${first}.${last}${n}`);
  return out.slice(0, max);
}

/** Lista de violações (vazia = email conforme). Não decide se bloqueia ou avisa. */
export function checkEmailAgainstPolicy(email: string, config: EmailPolicyConfig): string[] {
  if (!config.emailDomain) return [];
  const domain = normalizeDomain(config.emailDomain);
  const violations: string[] = [];
  if (/\s/.test(email)) violations.push('O email não pode conter espaços.');
  if (email !== email.toLowerCase()) violations.push('O email tem de estar em minúsculas.');

  const lower = email.toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 0 || lower.slice(at + 1) !== domain) {
    violations.push(`O email tem de terminar em @${domain}.`);
    return violations;
  }
  // nome.apelido, com sufixo numérico opcional para homónimos (ex.: antonio.miguel2)
  if (!/^[a-z0-9]+\.[a-z0-9]+$/.test(lower.slice(0, at))) {
    violations.push(
      'O email tem de seguir o formato nome.apelido (sem acentos nem outros símbolos).',
    );
  }
  return violations;
}
