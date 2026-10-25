import { isWebLink } from './is-web-link.decorator';

describe('isWebLink', () => {
  it.each([
    'https://meet.google.com/abc-defg-hij',
    'http://example.com/path?x=1#y',
    'https://www.linkedin.com/in/alguem',
  ])('aceita %s', url => {
    expect(isWebLink(url, true)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/x',
    '//evil.com/x',
    '/rota/interna',
    'example.com',
    'https://exa mple.com',
    undefined,
    null,
    42,
  ])('rejeita %p', url => {
    expect(isWebLink(url, true)).toBe(false);
  });

  it("aceita '' (campo limpo)", () => {
    expect(isWebLink('', true)).toBe(true);
  });

  it('rejeita URLs acima de 2048 caracteres', () => {
    expect(isWebLink(`https://example.com/${'a'.repeat(2050)}`, true)).toBe(false);
  });

  it('em dev aceita localhost; em produção exige TLD', () => {
    expect(isWebLink('http://localhost:3000/x', false)).toBe(true);
    expect(isWebLink('http://localhost:3000/x', true)).toBe(false);
  });

  describe('allowRelative', () => {
    const opts = { allowRelative: true };
    it('aceita caminhos internos', () => {
      expect(isWebLink('/courses/1/learn', true, opts)).toBe(true);
      expect(isWebLink('https://example.com', true, opts)).toBe(true);
    });
    it('rejeita protocol-relative, backslash e esquemas perigosos', () => {
      expect(isWebLink('//evil.com', true, opts)).toBe(false);
      expect(isWebLink('/\\evil.com', true, opts)).toBe(false);
      expect(isWebLink('javascript:alert(1)', true, opts)).toBe(false);
    });
  });
});
