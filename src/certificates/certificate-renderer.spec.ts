import {
  buildVerifyUrl,
  CertificateSnapshot,
  renderCertificatePdf,
  snapshotToTemplateInput,
} from './certificate-renderer';
import { BUILTIN_TEMPLATES } from './templates/builtin-templates';
import { buildLayoutPlan } from './templates/layout-plan';

const snapshot = (over: Partial<CertificateSnapshot> = {}): CertificateSnapshot => ({
  code: 'ABCD1234EFGH5678',
  recipientName: 'Ana Silva',
  title: 'Segurança no Trabalho',
  hours: 8,
  score: 82,
  issuedAt: '2026-10-19T10:00:00.000Z',
  expiresAt: '2027-10-19T10:00:00.000Z',
  issuerName: 'INNOVA',
  ...over,
});

const url = 'http://localhost:3000/verify/ABCD1234EFGH5678';

describe('renderCertificatePdf', () => {
  it('gera um PDF válido', async () => {
    const buf = await renderCertificatePdf(snapshot(), url);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('aceita nome com acentos, emoji e 200+ caracteres sem lançar', async () => {
    const name = 'José Ñandú 🎓 ' + 'A'.repeat(200);
    const buf = await renderCertificatePdf(snapshot({ recipientName: name }), url);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('sem nota/validade/horas gera PDF mais pequeno (linhas omitidas)', async () => {
    const full = await renderCertificatePdf(snapshot(), url);
    const bare = await renderCertificatePdf(
      snapshot({ score: undefined, expiresAt: null, hours: null }),
      url,
    );
    expect(bare.length).toBeLessThan(full.length);
  });
});

describe('snapshotToTemplateInput', () => {
  it('snapshot antigo (sem template) usa o corporativo clássico', () => {
    expect(snapshotToTemplateInput(snapshot()).config.layoutKey).toBe('corporativo-classico');
  });

  it('usa o template embutido no snapshot, não o actual', () => {
    const v1 = structuredClone(BUILTIN_TEMPLATES[2].config);
    v1.texts.title = 'TÍTULO DA VERSÃO 1';
    const snap = snapshot({ template: { id: BUILTIN_TEMPLATES[2].id, version: 1, config: v1 } });
    const stored = JSON.parse(JSON.stringify(snap)) as CertificateSnapshot;
    // Uma "v2" do template alterada depois não toca no que já foi gravado no snapshot.
    v1.texts.title = 'TÍTULO DA VERSÃO 2';
    const { config } = snapshotToTemplateInput(stored);
    expect(config.layoutKey).toBe('executivo-premium');
    expect(config.texts.title).toBe('TÍTULO DA VERSÃO 1');
  });

  it('mapeia os valores: horas, nota e datas só quando existem', () => {
    const { values } = snapshotToTemplateInput(snapshot());
    expect(values).toMatchObject({
      nome_completo: 'Ana Silva',
      nome_curso: 'Segurança no Trabalho',
      nome_formacao: 'Segurança no Trabalho',
      nome_empresa: 'INNOVA',
      carga_horaria: '8 h',
      nota_final: '82%',
      codigo_certificado: 'ABCD1234EFGH5678',
    });
    expect(values.data_emissao).toMatch(/2026/);
    expect(values.data_validade).toMatch(/2027/);

    const bare = snapshotToTemplateInput(
      snapshot({ score: undefined, hours: null, expiresAt: null }),
    ).values;
    expect(bare.carga_horaria).toBeUndefined();
    expect(bare.nota_final).toBeUndefined();
    expect(bare.data_validade).toBeUndefined();
  });

  it('o plano sem nota/validade/horas não tem essas linhas e nunca tem chavetas', () => {
    const { config, values } = snapshotToTemplateInput(
      snapshot({ score: undefined, hours: null, expiresAt: null }),
    );
    const ops = buildLayoutPlan(config, {
      values,
      hasLogo: false,
      hasBackground: false,
      hasSignature: false,
      verifyUrl: url,
    });
    const text = ops
      .filter(o => o.kind === 'text')
      .map(o => (o as { text: string }).text)
      .join('\n');
    expect(text).not.toMatch(/Nota|Válido até|Carga horária|\{\{/);
  });

  it('cada um dos nove templates gera PDF a partir do snapshot', async () => {
    for (const t of BUILTIN_TEMPLATES) {
      const pdf = await renderCertificatePdf(
        snapshot({ template: { id: t.id, version: 1, config: t.config } }),
        url,
      );
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
  }, 30_000);
});

describe('buildVerifyUrl', () => {
  const OLD = { app: process.env.APP_URL, front: process.env.FRONTEND_URL };
  const restore = (key: 'APP_URL' | 'FRONTEND_URL', v: string | undefined) => {
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  };
  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.FRONTEND_URL;
  });
  afterEach(() => {
    restore('APP_URL', OLD.app);
    restore('FRONTEND_URL', OLD.front);
  });

  it('usa APP_URL sem barra final quando não há FRONTEND_URL', () => {
    process.env.APP_URL = 'https://academia.example.com/';
    expect(buildVerifyUrl('ABC')).toBe('https://academia.example.com/verify/ABC');
  });

  it('prefere o endereço do frontend: a página /verify não existe no backend', () => {
    process.env.APP_URL = 'http://localhost:4000';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    expect(buildVerifyUrl('ABC')).toBe('http://localhost:3000/verify/ABC');
  });

  it('com vários FRONTEND_URL usa o primeiro, sem espaços nem barra final', () => {
    process.env.FRONTEND_URL = ' https://app.exemplo.ao/ , https://www.exemplo.ao';
    expect(buildVerifyUrl('ABC')).toBe('https://app.exemplo.ao/verify/ABC');
  });

  it('em desenvolvimento cai para localhost:3000', () => {
    expect(buildVerifyUrl('ABC')).toBe('http://localhost:3000/verify/ABC');
  });
});
