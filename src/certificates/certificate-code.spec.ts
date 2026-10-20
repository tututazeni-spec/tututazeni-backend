import { generateVerificationCode, normalizeVerificationCode } from './certificate-code';

describe('certificate-code', () => {
  it('gera 1000 códigos únicos de 16 chars do alfabeto Crockford', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateVerificationCode()));
    expect(codes.size).toBe(1000);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it('normaliza espaços, hífens e minúsculas', () => {
    expect(normalizeVerificationCode(' ab12-cd34 ')).toBe('AB12CD34');
  });

  it.each([['x'.repeat(65)], ["1' OR 1=1"], ['']])('rejeita %p', raw => {
    expect(normalizeVerificationCode(raw)).toBeNull();
  });
});
