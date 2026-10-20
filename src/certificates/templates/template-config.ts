import { findUnknownVariables, TEMPLATE_VARIABLES } from './template-variables';

export type Align = 'left' | 'center' | 'right';

export const LAYOUT_KEYS = [
  'corporativo-classico',
  'moderno-minimalista',
  'executivo-premium',
  'institucional-formal',
  'tecnologico-contemporaneo',
  'elegante-geometrico',
  'academico-tradicional',
  'faixa-lateral',
  'premium-moldura',
] as const;
export type LayoutKey = (typeof LAYOUT_KEYS)[number];

export const ELEMENT_KEYS = [
  'logo',
  'title',
  'recognition',
  'name',
  'course',
  'details',
  'signature',
  'qr',
  'code',
] as const;
export type ElementKey = (typeof ELEMENT_KEYS)[number];

export interface ElementTweak {
  align?: Align;
  /** Tamanho relativo (0.6–1.5). */
  scale?: number;
  /** Deslocamento em fração da página (−0.15…+0.15). */
  dx?: number;
  dy?: number;
  visible?: boolean;
}

export interface TemplateConfig {
  layoutKey: LayoutKey;
  colors: { primary: string; accent: string; text: string; background: string };
  texts: {
    title: string;
    recognition: string;
    courseLine: string;
    detailsLine: string;
    footer: string;
  };
  assets: { logoId?: string; backgroundId?: string; signatureId?: string };
  signatory: { name?: string; title?: string };
  options: {
    showQr: boolean;
    showCode: boolean;
    showHours: boolean;
    showValidity: boolean;
    showScore: boolean;
  };
  elements: Partial<Record<ElementKey, ElementTweak>>;
}

export const LIMITS = {
  title: 120,
  text: 300,
  signatory: 120,
  offset: 0.15,
  scaleMin: 0.6,
  scaleMax: 1.5,
} as const;

/** Rácio de contraste WCAG entre duas cores #RRGGBB. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const ASSET_ID = /^[A-Za-z0-9_-]{8,40}$/;
const TOP_KEYS = ['layoutKey', 'colors', 'texts', 'assets', 'signatory', 'options', 'elements'];
const COLOR_KEYS = ['primary', 'accent', 'text', 'background'] as const;
const COLOR_LABEL: Record<(typeof COLOR_KEYS)[number], string> = {
  primary: 'principal',
  accent: 'de destaque',
  text: 'do texto',
  background: 'do fundo',
};
const TEXT_LABEL = {
  title: 'título',
  recognition: 'texto de reconhecimento',
  courseLine: 'linha do curso',
  detailsLine: 'linha de detalhes',
  footer: 'rodapé',
} as const;
const OPTION_KEYS = ['showQr', 'showCode', 'showHours', 'showValidity', 'showScore'] as const;
const TWEAK_KEYS = ['align', 'scale', 'dx', 'dy', 'visible'];
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valida toda a configuração e devolve **todos** os erros (em português) de uma vez. */
export function validateTemplateConfig(
  input: unknown,
): { ok: true; config: TemplateConfig } | { ok: false; errors: string[] } {
  if (!isObj(input)) return { ok: false, errors: ['A configuração do modelo é inválida.'] };
  const errors: string[] = [];

  for (const k of Object.keys(input)) {
    if (!TOP_KEYS.includes(k)) errors.push(`Campo desconhecido na configuração: ${k}.`);
  }

  if (!LAYOUT_KEYS.includes(input.layoutKey as LayoutKey)) {
    errors.push('O layout do modelo é inválido.');
  }

  const colors = isObj(input.colors) ? input.colors : {};
  for (const key of COLOR_KEYS) {
    const v = colors[key];
    if (typeof v !== 'string' || !HEX.test(v)) {
      errors.push(`A cor ${COLOR_LABEL[key]} tem de ser no formato #RRGGBB.`);
    }
  }
  const hexOk = (k: (typeof COLOR_KEYS)[number]) =>
    typeof colors[k] === 'string' && HEX.test(colors[k]);
  if (
    hexOk('text') &&
    hexOk('background') &&
    contrastRatio(colors.text as string, colors.background as string) < 3
  ) {
    errors.push('Contraste insuficiente entre a cor do texto e a do fundo (mínimo 3:1).');
  }
  if (
    hexOk('primary') &&
    hexOk('background') &&
    contrastRatio(colors.primary as string, colors.background as string) < 1.5
  ) {
    errors.push('Contraste insuficiente entre a cor principal e a do fundo.');
  }

  const texts = isObj(input.texts) ? input.texts : {};
  for (const key of Object.keys(TEXT_LABEL) as (keyof typeof TEXT_LABEL)[]) {
    const v = texts[key];
    const label = TEXT_LABEL[key];
    if (typeof v !== 'string') {
      errors.push(`O ${label} é obrigatório.`);
      continue;
    }
    const max = key === 'title' ? LIMITS.title : LIMITS.text;
    if (v.length > max) errors.push(`O ${label} excede ${max} caracteres.`);
    if (key === 'title' && v.trim().length === 0) errors.push('O título não pode estar vazio.');
    const unknown = findUnknownVariables(v);
    if (unknown.length) {
      errors.push(
        `Variáveis desconhecidas no ${label}: ${unknown.join(', ')}. Válidas: ${TEMPLATE_VARIABLES.join(', ')}.`,
      );
    }
  }

  const assets = isObj(input.assets) ? input.assets : {};
  for (const [k, v] of Object.entries(assets)) {
    if (!['logoId', 'backgroundId', 'signatureId'].includes(k)) {
      errors.push(`Campo desconhecido nas imagens: ${k}.`);
    } else if (v !== undefined && (typeof v !== 'string' || !ASSET_ID.test(v))) {
      errors.push(`Identificador de imagem inválido em ${k}.`);
    }
  }

  const signatory = isObj(input.signatory) ? input.signatory : {};
  for (const k of ['name', 'title'] as const) {
    const v = signatory[k];
    if (v !== undefined && (typeof v !== 'string' || v.length > LIMITS.signatory)) {
      errors.push(
        `O ${k === 'name' ? 'nome' : 'cargo'} do responsável excede ${LIMITS.signatory} caracteres.`,
      );
    }
  }

  const options = isObj(input.options) ? input.options : {};
  for (const k of OPTION_KEYS) {
    if (typeof options[k] !== 'boolean')
      errors.push(`A opção ${k} tem de ser verdadeiro ou falso.`);
  }

  const elements = isObj(input.elements) ? input.elements : {};
  for (const [name, tweak] of Object.entries(elements)) {
    if (!ELEMENT_KEYS.includes(name as ElementKey)) {
      errors.push(`Elemento desconhecido: ${name}.`);
      continue;
    }
    if (!isObj(tweak)) {
      errors.push(`A posição do elemento ${name} é inválida.`);
      continue;
    }
    for (const [tk, tv] of Object.entries(tweak)) {
      if (!TWEAK_KEYS.includes(tk)) errors.push(`Propriedade desconhecida em ${name}: ${tk}.`);
      else if (tk === 'align' && !['left', 'center', 'right'].includes(tv as string)) {
        errors.push(`O alinhamento de ${name} tem de ser esquerda, centro ou direita.`);
      } else if (tk === 'scale') {
        if (typeof tv !== 'number' || tv < LIMITS.scaleMin || tv > LIMITS.scaleMax) {
          errors.push(
            `O tamanho de ${name} tem de estar entre ${LIMITS.scaleMin} e ${LIMITS.scaleMax}.`,
          );
        }
      } else if (
        (tk === 'dx' || tk === 'dy') &&
        (typeof tv !== 'number' || Math.abs(tv) > LIMITS.offset)
      ) {
        errors.push(
          `O deslocamento ${tk} de ${name} tem de estar entre −${LIMITS.offset} e ${LIMITS.offset}.`,
        );
      } else if (tk === 'visible' && typeof tv !== 'boolean') {
        errors.push(`A visibilidade de ${name} tem de ser verdadeiro ou falso.`);
      }
    }
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, config: input as unknown as TemplateConfig };
}
