import { avatarRef, avatarVersion, parseAvatarDataUrl, refUserAvatars } from './avatar-ref';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('avatar-ref', () => {
  it('converte data-URL numa referência versionada', () => {
    expect(avatarRef(7, PNG)).toBe(`/api/users/7/avatar?v=${avatarVersion(PNG)}`);
  });

  it('muda a versão quando a imagem muda', () => {
    expect(avatarVersion(PNG)).not.toBe(avatarVersion('data:image/png;base64,AAAA'));
  });

  it('deixa URLs normais e vazios como estão', () => {
    expect(avatarRef(1, 'https://cdn.exemplo.com/a.png')).toBe('https://cdn.exemplo.com/a.png');
    expect(avatarRef(1, null)).toBeNull();
    expect(avatarRef(1, undefined)).toBeNull();
  });

  it('descodifica imagens raster', () => {
    const parsed = parseAvatarDataUrl(PNG);
    expect(parsed?.mime).toBe('image/png');
    expect(parsed?.buffer.length).toBeGreaterThan(0);
  });

  it('recusa SVG, HTML e lixo (evita servir script no mesmo origin)', () => {
    expect(parseAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull();
    expect(parseAvatarDataUrl('data:text/html;base64,PGgxPg==')).toBeNull();
    expect(parseAvatarDataUrl('data:image/png;utf8,abc')).toBeNull();
  });
});

describe('refUserAvatars', () => {
  const user = { id: 3, fullName: 'Ana', avatarUrl: PNG };
  const ref = avatarRef(3, PNG);

  it('troca o avatar de linhas User, também aninhadas, sem mutar o original', () => {
    const input = { data: [{ id: 9, user }], meta: { total: 1 } };
    const out = refUserAvatars(input);
    expect(out.data[0].user.avatarUrl).toBe(ref);
    expect(input.data[0].user.avatarUrl).toBe(PNG);
    expect(out.meta).toBe(input.meta); // ramo intacto partilha referência
  });

  it('usa userId como dono quando existe', () => {
    const out = refUserAvatars({ id: 99, userId: 3, fullName: 'Ana', avatarUrl: PNG });
    expect(out.avatarUrl).toBe(ref);
  });

  it('não toca em Employee (name, não fullName) nem em objetos sem dono numérico', () => {
    const emp = { id: 5, name: 'Rui', avatarUrl: PNG };
    expect(refUserAvatars(emp)).toBe(emp);
    const sem = { fullName: 'Ana', avatarUrl: PNG };
    expect(refUserAvatars(sem)).toBe(sem);
  });

  it('ignora Buffer, Date e valores simples', () => {
    const buf = Buffer.from('x');
    const d = new Date();
    expect(refUserAvatars(buf)).toBe(buf);
    expect(refUserAvatars(d)).toBe(d);
    expect(refUserAvatars('texto')).toBe('texto');
    expect(refUserAvatars(null)).toBeNull();
  });

  it('é idempotente', () => {
    const once = refUserAvatars(user);
    expect(refUserAvatars(once)).toBe(once);
  });
});
