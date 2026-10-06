import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  nextSendWindowOpen,
} from './notification-settings';

const settings = (w: Partial<NotificationSettings['sendWindow']>): NotificationSettings => ({
  ...structuredClone(DEFAULT_NOTIFICATION_SETTINGS),
  sendWindow: { enabled: true, startHour: 8, endHour: 20, weekdaysOnly: false, ...w },
});

describe('nextSendWindowOpen', () => {
  const tz = 'UTC';

  it('devolve já se a janela está aberta', () => {
    const now = new Date('2026-10-06T10:00:00Z');
    expect(nextSendWindowOpen(settings({}), now, tz)).toEqual(now);
  });

  it('devolve a abertura do mesmo dia se ainda não abriu', () => {
    const r = nextSendWindowOpen(settings({}), new Date('2026-10-06T05:10:00Z'), tz);
    expect(r?.toISOString()).toBe('2026-10-06T08:00:00.000Z');
  });

  it('devolve a abertura do dia seguinte depois do fecho', () => {
    const r = nextSendWindowOpen(settings({}), new Date('2026-10-06T21:00:00Z'), tz);
    expect(r?.toISOString()).toBe('2026-10-07T08:00:00.000Z');
  });

  it('salta o fim-de-semana com weekdaysOnly', () => {
    // 2026-10-10 é sábado → abre segunda 12/10
    const r = nextSendWindowOpen(
      settings({ weekdaysOnly: true }),
      new Date('2026-10-10T12:00:00Z'),
      tz,
    );
    expect(r?.toISOString()).toBe('2026-10-12T08:00:00.000Z');
  });

  it('respeita o fuso do tenant', () => {
    // 05:10 UTC = 06:10 em Luanda (UTC+1) → abre 08:00 local = 07:00 UTC
    const r = nextSendWindowOpen(settings({}), new Date('2026-10-06T05:10:00Z'), 'Africa/Luanda');
    expect(r?.toISOString()).toBe('2026-10-06T07:00:00.000Z');
  });

  it('CRITICAL ignora a janela', () => {
    const now = new Date('2026-10-06T03:00:00Z');
    expect(nextSendWindowOpen(settings({}), now, tz, true)).toEqual(now);
  });

  it('devolve null se a janela nunca abre', () => {
    expect(
      nextSendWindowOpen(settings({ startHour: 8, endHour: 8 }), new Date('2026-10-06T05:00:00Z'), tz),
    ).toBeNull();
  });
});
