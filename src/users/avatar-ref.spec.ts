import { avatarRef, avatarVersion, parseAvatarDataUrl } from './avatar-ref';

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
