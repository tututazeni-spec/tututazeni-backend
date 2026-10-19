import { BUILTIN_TEMPLATES } from './builtin-templates';
import { buildLayoutPlan, Op, PAGE, RenderData } from './layout-plan';
import { TemplateConfig } from './template-config';

const FULL: RenderData = {
  values: {
    nome_completo: 'Ana Maria da Silva Pereira',
    nome_curso: 'Segurança no Trabalho',
    nome_formacao: 'Segurança no Trabalho',
    nome_empresa: 'INNOVA',
    carga_horaria: '40 h',
    nota_final: '87%',
    data_emissao: '20/10/2026',
    data_validade: '20/10/2028',
    codigo_certificado: 'ABCD1234EFGH5678',
  },
  hasLogo: true,
  hasBackground: false,
  hasSignature: true,
  verifyUrl: 'https://academia.example.com/verify/ABCD1234EFGH5678',
};

const SPARSE: RenderData = {
  values: {
    nome_completo: 'Ana Maria da Silva Pereira',
    nome_curso: 'Segurança no Trabalho',
    nome_empresa: 'INNOVA',
    data_emissao: '20/10/2026',
    codigo_certificado: 'ABCD1234EFGH5678',
  },
  hasLogo: false,
  hasBackground: false,
  hasSignature: false,
  verifyUrl: 'https://academia.example.com/verify/ABCD1234EFGH5678',
};

const templates = BUILTIN_TEMPLATES.map(t => [t.name, t.config] as const);
const withSignatory = (c: TemplateConfig): TemplateConfig => ({
  ...structuredClone(c),
  signatory: { name: 'Dr. Carlos Mendes', title: 'Director de Formação' },
});

const texts = (ops: Op[]) =>
  ops.filter((o): o is Extract<Op, { kind: 'text' }> => o.kind === 'text');

/** Caixa envolvente de uma operação, para provar que nada sai da página. */
function bounds(o: Op): [number, number, number, number] {
  switch (o.kind) {
    case 'rect':
    case 'image':
      return [o.x, o.y, o.x + o.w, o.y + o.h];
    case 'line':
      return [
        Math.min(o.x1, o.x2),
        Math.min(o.y1, o.y2),
        Math.max(o.x1, o.x2),
        Math.max(o.y1, o.y2),
      ];
    case 'circle':
      return [o.cx - o.r, o.cy - o.r, o.cx + o.r, o.cy + o.r];
    case 'polygon': {
      const xs = o.points.map(p => p[0]);
      const ys = o.points.map(p => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'text':
      return [o.x, o.y, o.x + o.w, o.y + o.size * 1.3 * (o.maxLines ?? 1)];
    case 'qr':
      return [o.x, o.y, o.x + o.size, o.y + o.size];
  }
}

const signature = (ops: Op[]) => {
  const kinds: Record<string, number> = {};
  for (const o of ops) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
  const fonts = [...new Set(texts(ops).map(t => t.font))].sort();
  const fills = [
    ...new Set(
      ops
        .flatMap(o => ('fill' in o && o.fill ? [o.fill] : []))
        .concat(ops.flatMap(o => ('stroke' in o && o.stroke ? [o.stroke] : []))),
    ),
  ].sort();
  return JSON.stringify({ kinds, fonts, fills });
};

describe.each(templates)('layout %s', (_name, config) => {
  const cfg = withSignatory(config);

  it('nenhum texto contém {{ }} e o nome aparece uma vez', () => {
    const ops = buildLayoutPlan(cfg, FULL);
    for (const t of texts(ops)) expect(t.text).not.toMatch(/\{\{|\}\}/);
    expect(texts(ops).filter(t => t.text === FULL.values.nome_completo)).toHaveLength(1);
  });

  it('tudo cai dentro da página, mesmo com deslocamentos e escala extremos', () => {
    const extreme: TemplateConfig = {
      ...cfg,
      elements: Object.fromEntries(
        [
          'logo',
          'title',
          'recognition',
          'name',
          'course',
          'details',
          'signature',
          'qr',
          'code',
        ].map(k => [k, { dx: 0.15, dy: 0.15, scale: 1.5 }]),
      ),
    };
    for (const c of [cfg, extreme]) {
      for (const o of buildLayoutPlan(c, FULL)) {
        const [x1, y1, x2, y2] = bounds(o);
        expect(x1).toBeGreaterThanOrEqual(-1);
        expect(y1).toBeGreaterThanOrEqual(-1);
        expect(x2).toBeLessThanOrEqual(PAGE.w + 1);
        expect(y2).toBeLessThanOrEqual(PAGE.h + 1);
      }
    }
  });

  it('dados esparsos: sem "Nota", "Válido até" nem "Carga horária" e sem linhas vazias', () => {
    const ops = buildLayoutPlan(cfg, SPARSE);
    const all = texts(ops)
      .map(t => t.text)
      .join('\n');
    expect(all).not.toMatch(/Nota|Válido até|Carga horária/);
    for (const t of texts(ops)) expect(t.text.trim()).not.toBe('');
    expect(all).toContain('Emitido em 20/10/2026');
  });

  it('as opções escondem horas, validade e nota mesmo havendo valores', () => {
    const off: TemplateConfig = {
      ...cfg,
      options: { ...cfg.options, showHours: false, showValidity: false, showScore: false },
    };
    const all = texts(buildLayoutPlan(off, FULL))
      .map(t => t.text)
      .join('\n');
    expect(all).not.toMatch(/40 h|87%|20\/10\/2028/);
  });

  it('showQr:false remove o QR e showCode:false remove o código', () => {
    const noQr = buildLayoutPlan({ ...cfg, options: { ...cfg.options, showQr: false } }, FULL);
    expect(noQr.some(o => o.kind === 'qr')).toBe(false);
    const noCode = buildLayoutPlan({ ...cfg, options: { ...cfg.options, showCode: false } }, FULL);
    expect(texts(noCode).some(t => t.text.includes('ABCD1234EFGH5678'))).toBe(false);
    expect(buildLayoutPlan(cfg, FULL).some(o => o.kind === 'qr')).toBe(true);
  });

  it('elements.signature.visible:false remove a assinatura; sem imagem não há image mas o nome fica', () => {
    const hidden = buildLayoutPlan({ ...cfg, elements: { signature: { visible: false } } }, FULL);
    expect(hidden.some(o => o.kind === 'image' && o.asset === 'signature')).toBe(false);
    expect(texts(hidden).some(t => t.text === 'Dr. Carlos Mendes')).toBe(false);

    const noImage = buildLayoutPlan(cfg, { ...FULL, hasSignature: false });
    expect(noImage.some(o => o.kind === 'image' && o.asset === 'signature')).toBe(false);
    expect(texts(noImage).some(t => t.text === 'Dr. Carlos Mendes')).toBe(true);
    expect(
      buildLayoutPlan(cfg, FULL).some(o => o.kind === 'image' && o.asset === 'signature'),
    ).toBe(true);
  });

  it('o fundo carregado é a primeira imagem e só existe se houver imagem de fundo', () => {
    expect(
      buildLayoutPlan(cfg, FULL).some(o => o.kind === 'image' && o.asset === 'background'),
    ).toBe(false);
    const bg = buildLayoutPlan(cfg, { ...FULL, hasBackground: true });
    const first = bg.find(o => o.kind === 'image');
    expect(first).toMatchObject({ asset: 'background', x: 0, y: 0, w: PAGE.w, h: PAGE.h });
  });

  it('nome com 200+ caracteres, acentos e emoji fica limitado e dentro da página', () => {
    const name = 'José Ñandú 🎓 ' + 'A'.repeat(200);
    const ops = buildLayoutPlan(cfg, { ...FULL, values: { ...FULL.values, nome_completo: name } });
    const nameOp = texts(ops).find(t => t.text.startsWith('José Ñandú'));
    expect(nameOp).toBeDefined();
    expect(nameOp!.text.length).toBeLessThanOrEqual(120);
    expect(nameOp!.text).not.toMatch(/🎓/);
    const [, , x2] = bounds(nameOp!);
    expect(x2).toBeLessThanOrEqual(PAGE.w + 1);
  });

  it('é determinístico: o mesmo template e dados dão sempre o mesmo plano', () => {
    expect(buildLayoutPlan(cfg, FULL)).toEqual(buildLayoutPlan(cfg, FULL));
  });
});

describe('os nove layouts são visualmente distintos', () => {
  it('assinaturas de operações (tipos, fontes e cores) diferentes entre todos os pares', () => {
    const sigs = BUILTIN_TEMPLATES.map(t =>
      signature(buildLayoutPlan(withSignatory(t.config), FULL)),
    );
    expect(new Set(sigs).size).toBe(9);
  });

  it('as cores da configuração chegam ao desenho', () => {
    const t = BUILTIN_TEMPLATES[1].config;
    const ops = buildLayoutPlan(
      withSignatory({ ...t, colors: { ...t.colors, accent: '#FF00AA' } }),
      FULL,
    );
    expect(JSON.stringify(ops)).toContain('#FF00AA');
  });

  it('deslocamento dy move o título', () => {
    const t = withSignatory(BUILTIN_TEMPLATES[0].config);
    const title = (c: TemplateConfig) =>
      texts(buildLayoutPlan(c, FULL)).find(x => x.text === c.texts.title)!;
    const base = title(t);
    const moved = title({ ...t, elements: { title: { dy: 0.1 } } });
    expect(moved.y).toBeGreaterThan(base.y);
  });

  it('alinhamento à esquerda do título muda o alinhamento do texto', () => {
    const t = withSignatory(BUILTIN_TEMPLATES[0].config);
    const title = (c: TemplateConfig) =>
      texts(buildLayoutPlan(c, FULL)).find(x => x.text === c.texts.title)!;
    expect(title(t).align).toBe('center');
    expect(title({ ...t, elements: { title: { align: 'left' } } }).align).toBe('left');
  });
});
