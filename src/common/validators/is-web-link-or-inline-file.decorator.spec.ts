/* eslint-disable no-script-url -- os URLs "javascript:" são o caso de teste: o filtro tem de os rejeitar */
import { isWebLinkOrInlineFile } from './is-web-link-or-inline-file.decorator';

describe('isWebLinkOrInlineFile', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc',
    '',
    `data:application/pdf;base64,${Buffer.from('%PDF-1.4').toString('base64')}`,
  ])('aceita %s', v => {
    expect(isWebLinkOrInlineFile(v, true)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'vbscript:x',
    '//evil.com',
    42,
    null,
  ])('rejeita %p', v => {
    expect(isWebLinkOrInlineFile(v, true)).toBe(false);
  });

  it('rejeita data URL acima do limite', () => {
    const big = `data:application/pdf;base64,${'A'.repeat(4000)}`;
    expect(isWebLinkOrInlineFile(big, true, 1000)).toBe(false);
  });
});
