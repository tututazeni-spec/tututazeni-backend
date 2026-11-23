import { BadRequestException } from '@nestjs/common';
import { assertValidAngolanIban, isValidAngolanIban, nibFromIban, normalizeIban } from './iban';

// IBAN de exemplo com controlo calculado (AO06 + 21 dígitos).
const valid = 'AO06004000010123456789012';

describe('iban', () => {
  it('normaliza espaços e minúsculas', () => {
    expect(normalizeIban(' ao06 0040 0001 0123 4567 8901 2 ')).toBe(valid);
  });

  it('aceita o IBAN com controlo correcto e deriva o NIB', () => {
    // O controlo do exemplo é calculado aqui para o teste não depender de um IBAN real.
    const body = '004000010123456789012';
    let check = 98 - Number(BigInt(body + '102400') % 97n);
    const iban = `AO${String(check).padStart(2, '0')}${body}`;
    expect(isValidAngolanIban(iban)).toBe(true);
    expect(nibFromIban(iban)).toBe(body);
  });

  it('rejeita formato e controlo errados', () => {
    expect(() => assertValidAngolanIban('AO12')).toThrow(BadRequestException);
    expect(() => assertValidAngolanIban('PT50' + '0'.repeat(21))).toThrow(BadRequestException);
    expect(isValidAngolanIban('AO00' + '1'.repeat(21))).toBe(false);
  });
});
