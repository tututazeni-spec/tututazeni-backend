import { of, lastValueFrom } from 'rxjs';
import { StripInlineFilesInterceptor } from './strip-inline-files.interceptor';

const ctx = (method: string, path: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, route: { path } }) }),
  }) as never;

const run = (method: string, path: string, body: unknown) =>
  lastValueFrom(
    new StripInlineFilesInterceptor().intercept(ctx(method, path), {
      handle: () => of(body),
    }),
  );

describe('StripInlineFilesInterceptor', () => {
  const inline = 'data:application/pdf;base64,AAAA';

  it('limpa o url inline nas listas e marca hasInlineFile', async () => {
    const out = (await run('GET', '/content-library', {
      data: [
        { id: 1, url: inline },
        { id: 2, url: 'https://x.y/z' },
      ],
    })) as { data: Record<string, unknown>[] };
    expect(out.data[0]).toEqual({ id: 1, url: '', hasInlineFile: true });
    expect(out.data[1]).toEqual({ id: 2, url: 'https://x.y/z' });
  });

  it('não mexe no detalhe GET :id', async () => {
    const body = { id: 1, url: inline };
    expect(await run('GET', '/content-library/:id', body)).toBe(body);
  });
});
