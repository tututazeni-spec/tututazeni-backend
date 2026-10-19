import { BUILTIN_TEMPLATES } from './builtin-templates';
import {
  contrastRatio,
  LAYOUT_KEYS,
  TemplateConfig,
  validateTemplateConfig,
} from './template-config';

const base = (): TemplateConfig => structuredClone(BUILTIN_TEMPLATES[0].config);

const errorsOf = (config: unknown) => {
  const r = validateTemplateConfig(config);
  return r.ok ? [] : r.errors;
};

describe('contrastRatio', () => {
  it('preto sobre branco ≈ 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
  it('cinzas próximos < 3', () => {
    expect(contrastRatio('#777777', '#888888')).toBeLessThan(3);
  });
  it('é simétrico', () => {
    expect(contrastRatio('#123456', '#FEDCBA')).toBeCloseTo(contrastRatio('#FEDCBA', '#123456'), 5);
  });
});

describe('validateTemplateConfig', () => {
  it('aceita uma configuração válida', () => {
    expect(validateTemplateConfig(base())).toMatchObject({ ok: true });
  });

  it('rejeita o que não é objecto', () => {
    expect(errorsOf(null).length).toBeGreaterThan(0);
    expect(errorsOf('x').length).toBeGreaterThan(0);
  });

  it.each([['#12345'], ['red'], ['#GGGGGG'], ['123456'], ['#1234567']])(
    'cor inválida %p',
    color => {
      const c = base();
      c.colors.primary = color;
      expect(errorsOf(c).join(' ')).toMatch(/cor/i);
    },
  );

  it('layoutKey desconhecido', () => {
    const c = { ...base(), layoutKey: 'inventado' };
    expect(errorsOf(c).join(' ')).toMatch(/layout/i);
  });

  it('título com 121 caracteres e texto com 301', () => {
    const c = base();
    c.texts.title = 'x'.repeat(121);
    c.texts.footer = 'y'.repeat(301);
    const errors = errorsOf(c);
    expect(errors.some(e => /título/i.test(e))).toBe(true);
    expect(errors.some(e => /rodapé/i.test(e))).toBe(true);
  });

  it('variáveis desconhecidas são rejeitadas e a lista das válidas é indicada', () => {
    const c = base();
    c.texts.recognition = 'Olá {{inventada}}';
    const e = errorsOf(c).join(' ');
    expect(e).toContain('inventada');
    expect(e).toContain('nome_completo');
  });

  it.each([
    ['dx fora do intervalo', { dx: 0.5 }],
    ['dy fora do intervalo', { dy: -0.5 }],
    ['scale demasiado grande', { scale: 3 }],
    ['scale demasiado pequena', { scale: 0.1 }],
    ['alinhamento inválido', { align: 'justify' }],
  ])('%s', (_n, tweak) => {
    const c = base();
    (c.elements as Record<string, unknown>).title = tweak;
    expect(errorsOf(c).length).toBeGreaterThan(0);
  });

  it('elemento desconhecido', () => {
    const c = base();
    (c.elements as Record<string, unknown>).foo = { dx: 0 };
    expect(errorsOf(c).join(' ')).toMatch(/elemento/i);
  });

  it('texto claro sobre fundo claro → contraste insuficiente', () => {
    const c = base();
    c.colors.background = '#FFFFFF';
    c.colors.text = '#FAFAFA';
    expect(errorsOf(c).join(' ')).toMatch(/contraste/i);
  });

  it('cor principal igual ao fundo → contraste insuficiente', () => {
    const c = base();
    c.colors.primary = c.colors.background;
    expect(errorsOf(c).join(' ')).toMatch(/contraste/i);
  });

  it('devolve todos os erros de uma vez', () => {
    const c = base();
    c.colors.primary = 'red';
    c.texts.title = 'x'.repeat(200);
    c.texts.recognition = '{{x}}';
    expect(errorsOf(c).length).toBeGreaterThanOrEqual(3);
  });

  it('ids de imagens têm de ser texto curto (sem caminhos nem URLs)', () => {
    const c = base();
    c.assets = { logoId: 'http://evil.example/logo.png' };
    expect(errorsOf(c).join(' ')).toMatch(/imagem/i);
    c.assets = { logoId: '../../etc/passwd' };
    expect(errorsOf(c).join(' ')).toMatch(/imagem/i);
    c.assets = { logoId: 'clx1abcd2efgh3' };
    expect(errorsOf(c)).toEqual([]);
  });

  it('remove campos desconhecidos nos objectos aninhados em vez de os guardar', () => {
    const c = { ...base(), extra: 'x' } as unknown;
    const r = validateTemplateConfig(c);
    expect(r.ok).toBe(false);
  });
});

describe('BUILTIN_TEMPLATES', () => {
  it('são exactamente 9, com ids, nomes e layouts distintos', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(9);
    expect(new Set(BUILTIN_TEMPLATES.map(t => t.id)).size).toBe(9);
    expect(new Set(BUILTIN_TEMPLATES.map(t => t.name)).size).toBe(9);
    expect(new Set(BUILTIN_TEMPLATES.map(t => t.config.layoutKey)).size).toBe(9);
    expect([...BUILTIN_TEMPLATES.map(t => t.config.layoutKey)].sort()).toEqual(
      [...LAYOUT_KEYS].sort(),
    );
  });

  it('seguem a ordem dos nove conceitos do prompt', () => {
    expect(BUILTIN_TEMPLATES.map(t => t.name)).toEqual([
      'Corporativo clássico',
      'Moderno minimalista',
      'Executivo premium',
      'Institucional formal',
      'Tecnológico contemporâneo',
      'Elegante com elementos geométricos',
      'Académico tradicional',
      'Moderno com faixa lateral',
      'Premium com moldura e destaque',
    ]);
  });

  it.each(BUILTIN_TEMPLATES.map(t => [t.name, t.config] as const))('%s é válido', (_n, config) => {
    expect(validateTemplateConfig(config)).toMatchObject({ ok: true });
  });

  it('cada template tem descrição em português', () => {
    for (const t of BUILTIN_TEMPLATES) expect(t.description.length).toBeGreaterThan(10);
  });
});
