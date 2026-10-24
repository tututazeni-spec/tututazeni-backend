import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUrl,
  totpAt,
  verifyTotp,
} from './totp';

// Vector de teste do RFC 6238 (Apêndice B, SHA-1): segredo ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  describe('base32', () => {
    it('faz round-trip de bytes arbitrários', () => {
      const buf = Buffer.from([0, 1, 2, 250, 251, 252, 255, 128, 7]);
      expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    });

    it('descodifica ignorando minúsculas, padding "=" e caracteres inválidos', () => {
      const encoded = base32Encode(Buffer.from('innova'));
      expect(base32Decode(encoded.toLowerCase() + '===').toString()).toBe('innova');
      expect(base32Decode(encoded.split('').join('-')).toString()).toBe('innova');
    });
  });

  describe('generateTotpSecret', () => {
    it('gera segredos base32 distintos com 32 caracteres por omissão (20 bytes)', () => {
      const a = generateTotpSecret();
      const b = generateTotpSecret();
      expect(a).toMatch(/^[A-Z2-7]{32}$/);
      expect(a).not.toBe(b);
    });
  });

  describe('totpAt', () => {
    it.each([
      [59, '287082'],
      [1111111109, '081804'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ])('bate com o vector RFC 6238 em t=%d', (seconds, expected) => {
      expect(totpAt(RFC_SECRET, seconds * 1000)).toBe(expected);
    });

    it('mantém o mesmo código dentro do mesmo passo de 30s', () => {
      expect(totpAt(RFC_SECRET, 60_000)).toBe(totpAt(RFC_SECRET, 89_999));
      expect(totpAt(RFC_SECRET, 60_000)).not.toBe(totpAt(RFC_SECRET, 90_000));
    });
  });

  describe('verifyTotp', () => {
    const now = 1_700_000_000_000;
    const code = totpAt(RFC_SECRET, now);

    it('aceita o código do passo actual', () => {
      expect(verifyTotp(RFC_SECRET, code, now)).toBe(true);
    });

    it('aceita o passo anterior e o seguinte (desvio de relógio)', () => {
      expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 30_000), now)).toBe(true);
      expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 30_000), now)).toBe(true);
    });

    it('rejeita códigos fora da janela de ±1 passo', () => {
      expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 90_000), now)).toBe(false);
      expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 90_000), now)).toBe(false);
    });

    it('rejeita um código errado', () => {
      const wrong = code === '000000' ? '000001' : '000000';
      expect(verifyTotp(RFC_SECRET, wrong, now)).toBe(false);
    });

    it.each(['', '12345', '1234567', 'abcdef', '12 456', '１２３４５６'])(
      'rejeita formato inválido sem lançar: %j',
      bad => {
        expect(verifyTotp(RFC_SECRET, bad, now)).toBe(false);
      },
    );
  });

  describe('otpauthUrl', () => {
    it('codifica emissor e conta e inclui os parâmetros do autenticador', () => {
      const url = otpauthUrl('ABC234', 'ana@innova.test', 'Innova & Co');
      expect(url).toBe(
        'otpauth://totp/Innova%20%26%20Co%3Aana%40innova.test?secret=ABC234&issuer=Innova%20%26%20Co&digits=6&period=30',
      );
    });
  });
});
