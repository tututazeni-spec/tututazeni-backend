import { decryptPii, decryptUserPii, encryptPii, isEncryptedPii } from './pii-crypto';

describe('pii-crypto', () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = 'chave-de-teste-pii';
  });

  it('cifra e decifra (ida e volta), com IV aleatório', () => {
    const a = encryptPii('005123456LA041')!;
    const b = encryptPii('005123456LA041')!;
    expect(isEncryptedPii(a)).toBe(true);
    expect(a).not.toContain('005123456LA041');
    expect(a).not.toBe(b);
    expect(decryptPii(a)).toBe('005123456LA041');
  });

  it('é idempotente e vazio vira null', () => {
    const a = encryptPii('123')!;
    expect(encryptPii(a)).toBe(a);
    expect(encryptPii('')).toBeNull();
    expect(encryptPii(undefined)).toBeNull();
  });

  it('aceita texto em claro legado', () => {
    expect(decryptPii('legado-123')).toBe('legado-123');
    expect(decryptPii(null)).toBeNull();
  });

  it('adulteração falha (GCM)', () => {
    const a = encryptPii('abc')!;
    const bad = a.slice(0, -2) + (a.endsWith('A') ? 'B' : 'A') + a.slice(-1);
    expect(() => decryptPii(bad)).toThrow();
  });

  it('decryptUserPii só toca nos campos presentes', () => {
    const u = { id: 1, nif: encryptPii('N1'), nib: encryptPii('B1') };
    expect(decryptUserPii(u)).toEqual({ id: 1, nif: 'N1', nib: 'B1' });
    expect(decryptUserPii({ id: 2, nif: encryptPii('N2') })).toEqual({ id: 2, nif: 'N2' });
    expect(decryptUserPii(null)).toBeNull();
  });
});
