// src/common/security/allowed-origins.spec.ts
import { parseAllowedOrigins } from './allowed-origins';

describe('parseAllowedOrigins', () => {
  it('em dev sem valor devolve o fallback localhost', () => {
    expect(parseAllowedOrigins(undefined, false)).toEqual(['http://localhost:3000']);
  });

  it('em dev com valor devolve a lista (trim aplicado)', () => {
    expect(parseAllowedOrigins('http://localhost:3000, http://localhost:5173', false)).toEqual([
      'http://localhost:3000',
      'http://localhost:5173',
    ]);
  });

  it('em produção sem valor lança erro (sem fallback silencioso)', () => {
    expect(() => parseAllowedOrigins(undefined, true)).toThrow(/ALLOWED_ORIGINS/);
    expect(() => parseAllowedOrigins('  ', true)).toThrow(/ALLOWED_ORIGINS/);
  });

  it('em produção rejeita origens http://', () => {
    expect(() => parseAllowedOrigins('https://ok.example.com,http://mau.example.com', true)).toThrow(
      /http:\/\/mau\.example\.com/,
    );
  });

  it('em produção aceita lista https válida', () => {
    expect(parseAllowedOrigins('https://innova.example.com', true)).toEqual([
      'https://innova.example.com',
    ]);
  });
});
