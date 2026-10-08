import { BadRequestException } from '@nestjs/common';
import { addHours } from './process-workflow';
import {
  DEFAULT_SETTINGS,
  formatCode,
  resolveSlaHours,
  sequenceOf,
  SETTING_KEYS,
  validateSetting,
} from './process-settings';

describe('process-settings (§14)', () => {
  it('os valores por omissão de todas as secções são válidos', () => {
    for (const key of SETTING_KEYS) {
      expect(() => validateSetting(key, DEFAULT_SETTINGS[key])).not.toThrow();
    }
  });

  it('rejeita prefixo de numeração inválido', () => {
    expect(() =>
      validateSetting('numbering', { prefix: 'A-B', includeYear: true, padding: 4 }),
    ).toThrow(BadRequestException);
  });

  it('a retenção da auditoria não desce de 5 anos', () => {
    const base = DEFAULT_SETTINGS.retention as Record<string, number>;
    expect(() => validateSetting('retention', { ...base, auditYears: 2 })).toThrow(
      BadRequestException,
    );
  });

  it('rejeita transição de estado para si próprio', () => {
    expect(() => validateSetting('statuses', { DRAFT: ['DRAFT'] })).toThrow(BadRequestException);
  });

  it('rejeita feriados repetidos e datas inválidas', () => {
    const cal = DEFAULT_SETTINGS.workCalendar as Record<string, unknown>;
    expect(() =>
      validateSetting('workCalendar', {
        ...cal,
        holidays: [
          { date: '2026-12-25', name: 'Natal' },
          { date: '2026-12-25', name: 'Natal 2' },
        ],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateSetting('workCalendar', { ...cal, holidays: [{ date: '25/12/2026', name: 'x' }] }),
    ).toThrow(BadRequestException);
  });
});

describe('numeração configurável', () => {
  const cfg = { prefix: 'PRC', includeYear: true, padding: 5 };

  it('formata e lê a sequência com o mesmo prefixo', () => {
    const code = formatCode(cfg, 2026, 7);
    expect(code).toBe('PRC-2026-00007');
    expect(sequenceOf(cfg, 2026, code)).toBe(7);
  });

  it('códigos de outro prefixo/ano não contam para a sequência', () => {
    expect(sequenceOf(cfg, 2026, 'PROC-2026-0042')).toBe(0);
    expect(sequenceOf(cfg, 2026, 'PRC-2025-00042')).toBe(0);
  });

  it('suporta códigos sem ano', () => {
    const noYear = { prefix: 'PRC', includeYear: false, padding: 3 };
    expect(formatCode(noYear, 2026, 12)).toBe('PRC-012');
    expect(sequenceOf(noYear, 2026, 'PRC-012')).toBe(12);
  });
});

describe('resolveSlaHours', () => {
  const priorities = [
    { code: 'NORMAL', slaFactor: 1 },
    { code: 'URGENT', slaFactor: 0.5 },
  ];
  const deadlines = [{ category: 'Formação', hours: 100 }];

  it('o SLA do modelo tem prioridade sobre o prazo padrão da categoria', () => {
    expect(
      resolveSlaHours({
        templateHours: 40,
        category: 'Formação',
        priority: 'NORMAL',
        deadlines,
        priorities,
      }),
    ).toBe(40);
  });

  it('usa o prazo padrão da categoria (sem distinguir maiúsculas) e aplica o factor', () => {
    expect(
      resolveSlaHours({
        templateHours: null,
        category: 'formação',
        priority: 'URGENT',
        deadlines,
        priorities,
      }),
    ).toBe(50);
  });

  it('sem SLA nem prazo padrão não há prazo', () => {
    expect(
      resolveSlaHours({
        templateHours: null,
        category: 'Outra',
        priority: 'NORMAL',
        deadlines,
        priorities,
      }),
    ).toBeNull();
  });
});

describe('addHours com calendário de trabalho', () => {
  it('salta feriados em dias úteis', () => {
    // Sexta 2026-12-25 é feriado: 24h úteis a partir de quinta 24/12 às 00:00 terminam na segunda.
    const from = new Date(2026, 11, 24, 0, 0, 0);
    const end = addHours(from, 24, 'BUSINESS_DAYS', {
      workDays: [1, 2, 3, 4, 5],
      holidays: [{ date: '2026-12-25' }],
    });
    expect(end.getDay()).toBe(1); // segunda-feira 28/12
    expect(end.getDate()).toBe(28);
  });

  it('sem calendário mantém o comportamento anterior (só fins-de-semana)', () => {
    const from = new Date(2026, 11, 24, 0, 0, 0);
    const end = addHours(from, 24, 'BUSINESS_DAYS');
    expect(end.getDate()).toBe(25);
  });

  it('um calendário sem dias úteis não bloqueia', () => {
    const end = addHours(new Date(2026, 0, 5), 24, 'BUSINESS_DAYS', { workDays: [], holidays: [] });
    expect(end instanceof Date).toBe(true);
  });
});
