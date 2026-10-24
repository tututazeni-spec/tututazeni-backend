import { buildLinkedInUrl } from './certificate-share';
import { buildVerifyUrl } from './certificate-renderer';

describe('buildLinkedInUrl', () => {
  const base = {
    title: 'Segurança & Conformidade (Nível 1)',
    issuerName: 'Academia INNOVA',
    issuedAt: new Date('2026-03-15T12:00:00Z'),
    expiresAt: null as Date | null,
    validationCode: 'ABC-123',
  };
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    process.env.APP_URL = 'https://app.innova.test/';
  });
  afterAll(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  const parse = (c: Parameters<typeof buildLinkedInUrl>[0]) => new URL(buildLinkedInUrl(c));

  it('aponta para o formulário oficial "Add to profile" do LinkedIn', () => {
    const url = parse(base);
    expect(`${url.origin}${url.pathname}`).toBe('https://www.linkedin.com/profile/add');
    expect(url.searchParams.get('startTask')).toBe('CERTIFICATION_NAME');
  });

  it('codifica o título (caracteres especiais não partem a query string)', () => {
    const url = parse(base);
    expect(url.searchParams.get('name')).toBe('Segurança & Conformidade (Nível 1)');
    // o "&" do título não pode criar um parâmetro novo
    expect([...url.searchParams.keys()]).not.toContain(' Conformidade (Nível 1)');
  });

  it('usa mês 1-12 (getUTCMonth é 0-11) e o ano em UTC', () => {
    const url = parse(base);
    expect(url.searchParams.get('issueYear')).toBe('2026');
    expect(url.searchParams.get('issueMonth')).toBe('3');
  });

  it('data na fronteira do ano usa UTC, não o fuso local', () => {
    const url = parse({ ...base, issuedAt: new Date('2026-12-31T23:30:00Z') });
    expect(url.searchParams.get('issueYear')).toBe('2026');
    expect(url.searchParams.get('issueMonth')).toBe('12');
  });

  it('omite a expiração quando o certificado não expira', () => {
    const url = parse(base);
    expect(url.searchParams.has('expirationYear')).toBe(false);
    expect(url.searchParams.has('expirationMonth')).toBe(false);
  });

  it('inclui a expiração quando existe', () => {
    const url = parse({ ...base, expiresAt: new Date('2028-01-10T00:00:00Z') });
    expect(url.searchParams.get('expirationYear')).toBe('2028');
    expect(url.searchParams.get('expirationMonth')).toBe('1');
  });

  it.each([null, ''])('emissor %p cai em INNOVA', issuerName => {
    expect(parse({ ...base, issuerName }).searchParams.get('organizationName')).toBe('INNOVA');
  });

  it('liga ao URL público de verificação e ao código, sem barra duplicada', () => {
    const url = parse(base);
    expect(url.searchParams.get('certUrl')).toBe('https://app.innova.test/verify/ABC-123');
    expect(url.searchParams.get('certUrl')).toBe(buildVerifyUrl('ABC-123'));
    expect(url.searchParams.get('certId')).toBe('ABC-123');
  });
});
