/**
 * Variáveis dos templates ({{nome}}): lista fechada, substituição validada e
 * tratamento de campos opcionais. Um certificado nunca mostra `{{…}}`.
 */
export const TEMPLATE_VARIABLES: readonly string[] = [
  'nome_completo',
  'nome_curso',
  'nome_formacao',
  'nome_trilha',
  'nome_empresa',
  'nome_instrutor',
  'carga_horaria',
  'nota_final',
  'data_emissao',
  'data_validade',
  'codigo_certificado',
  'competencias_adquiridas',
  'assinatura_responsavel',
  'qr_code',
];

/** Só aparecem quando aplicáveis e configuradas (nota, validade, instrutor, …). */
export const OPTIONAL_VARIABLES: readonly string[] = [
  'nota_final',
  'data_validade',
  'nome_instrutor',
  'competencias_adquiridas',
  'carga_horaria',
  'nome_trilha',
];

/** Marcadores de bloco: o desenho trata a assinatura e o QR à parte; no texto não deixam nada. */
const BLOCK_MARKERS: readonly string[] = ['assinatura_responsavel', 'qr_code'];

export type VariableValues = Partial<Record<string, string | undefined>>;

const VAR_RE = /\{\{\s*([^{}\s]+)\s*\}\}/g;
// Separadores entre segmentos de uma mesma linha (informação opcional vai num segmento próprio).
const SEGMENT_SPLIT = /\s*[·|]\s*/;

export function findUnknownVariables(text: string): string[] {
  const unknown: string[] = [];
  for (const m of text.matchAll(VAR_RE)) {
    const name = m[1];
    if (!TEMPLATE_VARIABLES.includes(name) && !unknown.includes(name)) unknown.push(name);
  }
  return unknown;
}

const hasContent = (s: string) => /[\p{L}\p{N}]/u.test(s);

function renderSegment(segment: string, values: VariableValues): string | null {
  let dropped = false;
  const out = segment.replace(VAR_RE, (_all, name: string) => {
    const known = TEMPLATE_VARIABLES.includes(name);
    const value = values[name];
    if (known && !BLOCK_MARKERS.includes(name) && value && value.trim()) {
      // O valor entra como texto: nunca é re-expandido nem pode trazer chavetas duplas.
      return value.replace(/\{\{|\}\}/g, '');
    }
    if (known && OPTIONAL_VARIABLES.includes(name)) dropped = true;
    return '';
  });
  if (dropped) return null;
  const clean = out.replace(/\s{2,}/g, ' ').trim();
  return hasContent(clean) ? clean : null;
}

/**
 * Substitui as variáveis de uma linha. Devolve `null` quando a linha deve ser
 * omitida: todos os segmentos (separados por "·" ou "|") que contenham uma
 * variável opcional sem valor caem; se não sobrar texto, a linha desaparece.
 */
export function renderVariables(text: string, values: VariableValues): string | null {
  const segments = text.split(SEGMENT_SPLIT);
  const kept = segments
    .map(seg => renderSegment(seg, values))
    .filter((s): s is string => s !== null);
  return kept.length ? kept.join(' · ') : null;
}

/** Um parágrafo (várias linhas) → linhas prontas a desenhar, sem vazias nem `{{`. */
export function renderParagraph(text: string, values: VariableValues): string[] {
  return text
    .split('\n')
    .map(line => renderVariables(line, values))
    .filter((l): l is string => l !== null);
}
