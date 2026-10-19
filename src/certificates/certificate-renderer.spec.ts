import { buildVerifyUrl, CertificateSnapshot, renderCertificatePdf } from './certificate-renderer';

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

const url = 'http://localhost:3000/verificar/ABCD1234EFGH5678';

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

describe('buildVerifyUrl', () => {
  const OLD = process.env.APP_URL;
  afterEach(() => {
    process.env.APP_URL = OLD;
  });

  it('usa APP_URL sem barra final', () => {
    process.env.APP_URL = 'https://academia.example.com/';
    expect(buildVerifyUrl('ABC')).toBe('https://academia.example.com/verificar/ABC');
  });

  it('em desenvolvimento cai para localhost:3000', () => {
    delete process.env.APP_URL;
    expect(buildVerifyUrl('ABC')).toBe('http://localhost:3000/verificar/ABC');
  });
});
