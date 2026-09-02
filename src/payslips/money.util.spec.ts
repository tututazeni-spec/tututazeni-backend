import { money, assertNetInvariant } from './money.util';

describe('money', () => {
  it('rounds to 2 decimals', () => {
    expect(money(1234.5678)).toBe(1234.57);
    expect(money(0.1 + 0.2)).toBe(0.3);
    expect(money(70000 / 22)).toBe(3181.82);
  });
  it('handles negatives and zero', () => {
    expect(money(-0.005)).toBe(-0); // JS Math.round(-0.5) = -0 (banker's rounding)
    expect(money(0)).toBe(0);
  });
});

describe('assertNetInvariant', () => {
  it('passes when gross - deductions === net within 1 cent', () => {
    expect(() =>
      assertNetInvariant({ grossSalary: 100, totalDeductions: 30, netSalary: 70 }),
    ).not.toThrow();
    expect(() =>
      assertNetInvariant({ grossSalary: 100, totalDeductions: 30, netSalary: 69.995 }),
    ).not.toThrow();
  });
  it('throws when the gap exceeds 1 cent', () => {
    expect(() =>
      assertNetInvariant({ grossSalary: 100, totalDeductions: 30, netSalary: 68 }),
    ).toThrow(/invariant/i);
  });
});
