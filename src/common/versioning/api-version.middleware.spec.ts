import { parseVersionedUrl } from './api-version.middleware';

describe('parseVersionedUrl', () => {
  it('remove o prefixo /v1 e mantém query', () => {
    expect(parseVersionedUrl('/v1/courses?page=2')).toEqual({
      version: 'v1',
      url: '/courses?page=2',
    });
  });

  it('/v1 sozinho resolve para a raiz', () => {
    expect(parseVersionedUrl('/v1')).toEqual({ version: 'v1', url: '/' });
  });

  it('não confunde rotas que apenas começam por v1', () => {
    expect(parseVersionedUrl('/v1abc/x')).toEqual({ version: null, url: '/v1abc/x' });
  });

  it('sem prefixo devolve o URL intacto', () => {
    expect(parseVersionedUrl('/courses')).toEqual({ version: null, url: '/courses' });
  });
});
