import { LayoutKey, TemplateConfig } from './template-config';

export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  config: TemplateConfig;
}

/**
 * Textos por omissão. Informação opcional (horas, nota, validade) fica em
 * segmentos separados por "·": os que não tiverem valor desaparecem do certificado.
 */
const DEFAULT_TEXTS: TemplateConfig['texts'] = {
  title: 'CERTIFICADO',
  recognition: 'Certificamos que',
  courseLine: 'concluiu com aproveitamento\n{{nome_curso}}',
  detailsLine:
    'Carga horária: {{carga_horaria}} · Nota final: {{nota_final}} · Emitido em {{data_emissao}} · Válido até {{data_validade}}',
  footer: 'Código de verificação: {{codigo_certificado}}',
};

function make(
  layoutKey: LayoutKey,
  colors: TemplateConfig['colors'],
  texts: Partial<TemplateConfig['texts']> = {},
): TemplateConfig {
  return {
    layoutKey,
    colors,
    texts: { ...DEFAULT_TEXTS, ...texts },
    assets: {},
    signatory: {},
    options: { showQr: true, showCode: true, showHours: true, showValidity: true, showScore: true },
    elements: {},
  };
}

/** Os nove modelos de sistema, pela ordem dos conceitos do prompt. Ids fixos. */
export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    id: 'tpl-1-corporativo-classico',
    name: 'Corporativo clássico',
    description:
      'Dupla moldura azul-marinho, composição centrada e sóbria. Adequado a qualquer formação interna.',
    config: make('corporativo-classico', {
      primary: '#0F1F3D',
      accent: '#B8860B',
      text: '#1F2937',
      background: '#FFFFFF',
    }),
  },
  {
    id: 'tpl-2-moderno-minimalista',
    name: 'Moderno minimalista',
    description:
      'Muito espaço em branco, título alinhado à esquerda e uma linha de destaque. Limpo e actual.',
    config: make(
      'moderno-minimalista',
      { primary: '#111827', accent: '#2563EB', text: '#111827', background: '#FFFFFF' },
      { title: 'Certificado' },
    ),
  },
  {
    id: 'tpl-3-executivo-premium',
    name: 'Executivo premium',
    description:
      'Fundo azul-noite com detalhes dourados e tipografia com serifa. Para programas de liderança.',
    config: make(
      'executivo-premium',
      { primary: '#C9A24B', accent: '#C9A24B', text: '#F5F1E6', background: '#0B1426' },
      { title: 'CERTIFICADO DE EXCELÊNCIA' },
    ),
  },
  {
    id: 'tpl-4-institucional-formal',
    name: 'Institucional formal',
    description:
      'Faixa superior com o logótipo, selo oficial e texto à esquerda. Tom institucional.',
    config: make(
      'institucional-formal',
      { primary: '#1E3A8A', accent: '#64748B', text: '#1E293B', background: '#FFFFFF' },
      { title: 'CERTIFICADO DE FORMAÇÃO' },
    ),
  },
  {
    id: 'tpl-5-tecnologico',
    name: 'Tecnológico contemporâneo',
    description:
      'Fundo escuro, formas angulares em ciano e metadados em tipo monoespaçado. Para formações técnicas.',
    config: make(
      'tecnologico-contemporaneo',
      { primary: '#22D3EE', accent: '#38BDF8', text: '#E2E8F0', background: '#0F172A' },
      { title: 'CERTIFICAÇÃO TÉCNICA' },
    ),
  },
  {
    id: 'tpl-6-elegante-geometrico',
    name: 'Elegante com elementos geométricos',
    description:
      'Cantos triangulares, losango separador e paleta violeta e dourado. Elegante e leve.',
    config: make('elegante-geometrico', {
      primary: '#7C3AED',
      accent: '#D4A017',
      text: '#3B2F2F',
      background: '#FDFCFB',
    }),
  },
  {
    id: 'tpl-7-academico-tradicional',
    name: 'Académico tradicional',
    description:
      'Moldura ornamentada, tipografia clássica e selo circular, ao estilo de um diploma.',
    config: make(
      'academico-tradicional',
      { primary: '#7A1F1F', accent: '#B08D57', text: '#2B2B2B', background: '#FFFDF5' },
      { title: 'DIPLOMA DE CONCLUSÃO' },
    ),
  },
  {
    id: 'tpl-8-faixa-lateral',
    name: 'Moderno com faixa lateral',
    description:
      'Faixa vertical colorida com o logótipo e o QR Code; o conteúdo ocupa o resto da página.',
    config: make('faixa-lateral', {
      primary: '#0F766E',
      accent: '#F59E0B',
      text: '#1F2937',
      background: '#FFFFFF',
    }),
  },
  {
    id: 'tpl-9-premium-moldura',
    name: 'Premium com moldura e destaque',
    description:
      'Moldura dupla grossa, ornamentos nos cantos e fita em destaque para o nome da formação.',
    config: make(
      'premium-moldura',
      { primary: '#8B6B1F', accent: '#C9A24B', text: '#2A2118', background: '#FAF7F0' },
      { title: 'CERTIFICADO DE MÉRITO' },
    ),
  },
];
