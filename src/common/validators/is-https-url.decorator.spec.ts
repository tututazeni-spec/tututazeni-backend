import { validate } from 'class-validator';
import { IsHttpsUrl, isAllowedIntegrationUrl } from './is-https-url.decorator';

class Dto {
  @IsHttpsUrl()
  url!: string;
}

describe('isAllowedIntegrationUrl', () => {
  it('produção: aceita https', () => {
    expect(isAllowedIntegrationUrl('https://erp.empresa.ao/hook', true)).toBe(true);
  });

  it.each(['http://erp.empresa.ao/hook', 'ftp://x.com', 'erp.empresa.ao', 'https://localhost'])(
    'produção: rejeita %s',
    url => {
      expect(isAllowedIntegrationUrl(url, true)).toBe(false);
    },
  );

  it('fora de produção: aceita http://localhost', () => {
    expect(isAllowedIntegrationUrl('http://localhost:4000/hook', false)).toBe(true);
  });

  it('rejeita valores não-string', () => {
    expect(isAllowedIntegrationUrl(undefined, false)).toBe(false);
  });
});

describe('@IsHttpsUrl', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('em produção devolve erro para http://', async () => {
    process.env.NODE_ENV = 'production';
    const dto = Object.assign(new Dto(), { url: 'http://erp.empresa.ao' });
    const errors = await validate(dto);
    expect(errors[0].constraints?.isHttpsUrl).toContain('https://');
  });

  it('em produção aceita https://', async () => {
    process.env.NODE_ENV = 'production';
    const dto = Object.assign(new Dto(), { url: 'https://erp.empresa.ao' });
    expect(await validate(dto)).toHaveLength(0);
  });
});
