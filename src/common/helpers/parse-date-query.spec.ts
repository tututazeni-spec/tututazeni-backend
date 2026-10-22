import { BadRequestException } from '@nestjs/common';
import { parseDateQuery } from './parse-date-query';

describe('parseDateQuery', () => {
  it('converte uma data ISO válida', () => {
    expect(parseDateQuery('2026-01-15', 'start').toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('rejeita valor em falta com 400', () => {
    expect(() => parseDateQuery(undefined, 'start')).toThrow(BadRequestException);
    expect(() => parseDateQuery('', 'start')).toThrow(BadRequestException);
  });

  it('rejeita data inválida com 400', () => {
    expect(() => parseDateQuery('não-é-data', 'end')).toThrow(/"end"/);
  });
});
