import QRCode from 'qrcode';
import { BUILTIN_TEMPLATES } from './builtin-templates';
import { buildLayoutPlan, RenderData } from './layout-plan';
import { renderPlanToPdf } from './plan-renderer';
import { makePng } from './test-images';

const FULL: RenderData = {
  values: {
    nome_completo: 'Ana Maria da Silva Pereira',
    nome_curso: 'Segurança no Trabalho',
    nome_empresa: 'INNOVA',
    carga_horaria: '40 h',
    nota_final: '87%',
    data_emissao: '20/10/2026',
    data_validade: '20/10/2028',
    codigo_certificado: 'ABCD1234EFGH5678',
  },
  hasLogo: true,
  hasBackground: true,
  hasSignature: true,
  verifyUrl: 'https://academia.example.com/verify/ABCD1234EFGH5678',
};
const SPARSE: RenderData = {
  ...FULL,
  values: { nome_completo: 'Ana', nome_curso: 'X', codigo_certificado: 'ABCD1234EFGH5678' },
  hasLogo: false,
  hasBackground: false,
  hasSignature: false,
};

const assets = {
  logo: makePng(120, 60),
  background: makePng(300, 200),
  signature: makePng(160, 50),
};
const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe.each(BUILTIN_TEMPLATES.map(t => [t.name, t.config] as const))(
  'renderPlanToPdf — %s',
  (_n, config) => {
    const cfg = { ...config, signatory: { name: 'Dr. Carlos Mendes', title: 'Director' } };

    it.each([
      ['dados completos com imagens', FULL, assets],
      ['dados esparsos sem imagens', SPARSE, {}],
    ])('%s → PDF de uma só página', async (_label, data, imgs) => {
      const qr = await QRCode.toBuffer(data.verifyUrl, { margin: 1, width: 240 });
      const pdf = await renderPlanToPdf(buildLayoutPlan(cfg, data), imgs, qr);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pages(pdf)).toBe(1);
      expect(pdf.length).toBeGreaterThan(1500);
    });
  },
);

describe('renderPlanToPdf — robustez', () => {
  const cfg = BUILTIN_TEMPLATES[0].config;

  it('nome gigante com emoji continua numa só página', async () => {
    const data = {
      ...FULL,
      values: { ...FULL.values, nome_completo: 'José Ñandú 🎓 ' + 'A'.repeat(300) },
    };
    const qr = await QRCode.toBuffer(data.verifyUrl);
    const pdf = await renderPlanToPdf(buildLayoutPlan(cfg, data), assets, qr);
    expect(pages(pdf)).toBe(1);
  });

  it('um asset em falta ou corrompido não impede o PDF', async () => {
    const qr = await QRCode.toBuffer(FULL.verifyUrl);
    const bad = { logo: Buffer.from('isto não é uma imagem'), signature: undefined };
    const pdf = await renderPlanToPdf(buildLayoutPlan(cfg, FULL), bad, qr);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toBe(1);
  });

  it('o mesmo plano gera sempre o mesmo número de páginas e tamanho comparável', async () => {
    const qr = await QRCode.toBuffer(FULL.verifyUrl);
    const plan = buildLayoutPlan(cfg, SPARSE);
    const a = await renderPlanToPdf(plan, {}, qr);
    const b = await renderPlanToPdf(plan, {}, qr);
    expect(pages(a)).toBe(pages(b));
    expect(Math.abs(a.length - b.length)).toBeLessThan(200);
  });
});
