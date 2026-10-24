import { NotificationSettingsService } from './notification-settings.service';
import { DEFAULT_NOTIFICATION_SETTINGS } from './notification-settings';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));

const audit = writeChainedAuditLog as jest.Mock;

// Só o Date é falso; timers e microtasks reais para as promessas continuarem a resolver.
const freezeAt = (iso: string) =>
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'setTimeout',
      'setInterval',
      'setImmediate',
      'clearTimeout',
      'clearInterval',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'performance',
    ],
  });

describe('NotificationSettingsService', () => {
  let prisma: any;
  let service: NotificationSettingsService;

  const stored = (json: object | null, defaultTimezone: string | null = 'Africa/Luanda') =>
    prisma.tenantConfig.findUnique.mockResolvedValue({
      notificationSettingsJson: json ? JSON.stringify(json) : null,
      defaultTimezone,
    });
  const saved = () =>
    JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.notificationSettingsJson);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ notificationSettingsJson: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      notificationTemplate: { count: jest.fn().mockResolvedValue(3) },
    };
    prisma.read = prisma;
    service = new NotificationSettingsService(prisma);
  });

  afterEach(() => jest.useRealTimers());

  describe('get', () => {
    it('devolve as definições com fuso, chaves de evento e nº de templates activos', async () => {
      const v = await service.get();
      expect(v).toMatchObject({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        timeZone: 'Africa/Luanda',
        activeTemplates: 3,
      });
      expect(v.eventKeys).toContain('ENROLLMENT');
      expect(prisma.notificationTemplate.count).toHaveBeenCalledWith({ where: { active: true } });
    });

    it('sem fuso configurado usa Africa/Luanda', async () => {
      stored(null, null);
      expect((await service.get()).timeZone).toBe('Africa/Luanda');
    });
  });

  describe('update', () => {
    it('faz merge por secção, ignorando campos undefined', async () => {
      prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue({
        notificationSettingsJson: JSON.stringify({ channels: { whatsapp: true } }),
      });
      await service.update(
        { channels: { email: false, inApp: undefined }, events: { ENROLLMENT: false } } as never,
        4,
      );
      expect(saved().channels).toEqual({ inApp: true, email: false, whatsapp: true });
      expect(saved().events).toMatchObject({ ENROLLMENT: false, COURSE_REMINDER: true });
    });

    it('criticalBypassWindow=false é respeitado (não cai no valor anterior)', async () => {
      await service.update({ criticalBypassWindow: false } as never);
      expect(saved().criticalBypassWindow).toBe(false);
    });

    it('sem criticalBypassWindow no DTO mantém o actual', async () => {
      prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue({
        notificationSettingsJson: JSON.stringify({ criticalBypassWindow: false }),
      });
      await service.update({ channels: { email: false } } as never);
      expect(saved().criticalBypassWindow).toBe(false);
    });

    it('invalida a cache e audita antes/depois', async () => {
      await service.get();
      await service.update({ channels: { email: false } } as never, 4);
      await service.get();
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(2);
      expect(audit.mock.calls[0][1]).toMatchObject({
        userId: 4,
        action: 'SETTINGS_NOTIFICATIONS_UPDATE',
      });
      const meta = JSON.parse(audit.mock.calls[0][1].metadata);
      expect(meta.before.channels.email).toBe(true);
      expect(meta.after.channels.email).toBe(false);
    });

    it('falha ao auditar não impede a gravação', async () => {
      audit.mockRejectedValueOnce(new Error('x'));
      await expect(service.update({ channels: { email: false } } as never)).resolves.toBeDefined();
    });
  });

  describe('isEventDisabled', () => {
    it('evento desligado bloqueia os tipos que lhe pertencem', async () => {
      stored({ events: { COURSE_REMINDER: false } });
      await expect(service.isEventDisabled('COURSE_ENROLLMENT_REMINDER')).resolves.toBe(true);
    });

    it('tipos transversais (segurança, recibos…) nunca são bloqueados', async () => {
      stored({
        events: {
          ENROLLMENT: false,
          COURSE_REMINDER: false,
          CORPORATE_EVENT: false,
          PENDING_EVALUATION: false,
        },
      });
      for (const t of ['PASSWORD_RESET', 'PAYSLIP_ISSUED', 'SECURITY_ALERT']) {
        await expect(service.isEventDisabled(t)).resolves.toBe(false);
      }
    });

    it('evento ligado não bloqueia', async () => {
      await expect(service.isEventDisabled('ENROLLMENT_CONFIRMED')).resolves.toBe(false);
    });
  });

  describe('deliveryPlan (janela 08–20, Africa/Luanda = UTC+1)', () => {
    const window = {
      sendWindow: { enabled: true, startHour: 8, endHour: 20, weekdaysOnly: false },
    };

    it('sem janela: canais conforme configuração, nada a adiar', async () => {
      await expect(service.deliveryPlan(false)).resolves.toEqual({
        inApp: true,
        email: true,
        whatsapp: false,
        deferUntil: null,
      });
    });

    it('dentro da janela: email sai agora', async () => {
      freezeAt('2026-10-26T10:00:00Z'); // segunda 11:00 local
      stored(window);
      const plan = await service.deliveryPlan(false);
      expect(plan).toMatchObject({ email: true, deferUntil: null });
    });

    it('fora da janela: email adiado para a abertura seguinte (08:00 locais) e in-app continua', async () => {
      freezeAt('2026-10-26T05:00:00Z'); // segunda 06:00 local
      stored(window);
      const plan = await service.deliveryPlan(false);
      expect(plan.inApp).toBe(true);
      expect(plan.email).toBe(false);
      expect(plan.deferUntil?.toISOString()).toBe('2026-10-26T07:00:00.000Z');
    });

    it('fora da janela mas sem canais externos activos → nada a adiar', async () => {
      freezeAt('2026-10-26T05:00:00Z');
      stored({ ...window, channels: { inApp: true, email: false, whatsapp: false } });
      await expect(service.deliveryPlan(false)).resolves.toMatchObject({
        email: false,
        deferUntil: null,
      });
    });

    it('notificação crítica ignora a janela (por omissão)', async () => {
      freezeAt('2026-10-26T05:00:00Z');
      stored(window);
      await expect(service.deliveryPlan(true)).resolves.toMatchObject({
        email: true,
        deferUntil: null,
      });
    });

    it('com criticalBypassWindow desligado, a crítica também espera', async () => {
      freezeAt('2026-10-26T05:00:00Z');
      stored({ ...window, criticalBypassWindow: false });
      const plan = await service.deliveryPlan(true);
      expect(plan.email).toBe(false);
      expect(plan.deferUntil).toBeInstanceOf(Date);
    });

    it('só dias úteis: sábado fica para segunda-feira', async () => {
      freezeAt('2026-10-24T10:00:00Z'); // sábado
      stored({ sendWindow: { enabled: true, startHour: 8, endHour: 20, weekdaysOnly: true } });
      const plan = await service.deliveryPlan(false);
      expect(plan.email).toBe(false);
      expect(plan.deferUntil?.toISOString()).toBe('2026-10-26T07:00:00.000Z');
    });

    it('WhatsApp segue a mesma regra da janela', async () => {
      freezeAt('2026-10-26T05:00:00Z');
      stored({ ...window, channels: { inApp: true, email: false, whatsapp: true } });
      await expect(service.deliveryPlan(false)).resolves.toMatchObject({ whatsapp: false });
    });
  });
});
