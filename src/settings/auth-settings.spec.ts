import { renderLdapFilter } from './auth-settings';

describe('renderLdapFilter', () => {
  const template = '(&(objectClass=person)(mail={{email}}))';

  it('substitui {{email}} pelo email', () => {
    expect(renderLdapFilter(template, 'ana@innova.test')).toBe(
      '(&(objectClass=person)(mail=ana@innova.test))',
    );
  });

  it('substitui todas as ocorrências do placeholder', () => {
    expect(renderLdapFilter('(|(mail={{email}})(uid={{email}}))', 'a@b.c')).toBe(
      '(|(mail=a@b.c)(uid=a@b.c))',
    );
  });

  it.each([
    ['*', '\\2a'],
    ['(', '\\28'],
    [')', '\\29'],
    ['\\', '\\5c'],
    ['\0', '\\00'],
  ])('escapa o carácter especial %j (RFC 4515)', (ch, escaped) => {
    expect(renderLdapFilter('(mail={{email}})', `a${ch}b`)).toBe(`(mail=a${escaped}b)`);
  });

  it('neutraliza uma tentativa de injecção que fecha o filtro e acrescenta outro', () => {
    const out = renderLdapFilter(template, 'x)(uid=*))(|(uid=*');
    expect(out).not.toContain(')(uid=*');
    expect(out).toBe('(&(objectClass=person)(mail=x\\29\\28uid=\\2a\\29\\29\\28|\\28uid=\\2a))');
  });

  it('wildcard sozinho não devolve todo o directório', () => {
    expect(renderLdapFilter('(mail={{email}})', '*')).toBe('(mail=\\2a)');
  });

  it("trata padrões especiais de String.replace ($&, $`, $') como texto literal", () => {
    // Se o email fosse usado como string de substituição, "$&" reinjectava "{{email}}"
    // e "$'" / "$`" copiavam partes do template para dentro do valor.
    const out = renderLdapFilter('(mail={{email}})', "a$&b$'c$`d@x.com");
    expect(out).toBe("(mail=a$&b$'c$`d@x.com)");
  });
});
