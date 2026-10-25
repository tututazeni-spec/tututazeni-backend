import { BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Twilio } from 'twilio';
import { IntegrationSettingsService } from './integration-settings.service';
import { DEFAULT_INTEGRATION_SETTINGS } from './integration-settings';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('twilio', () => ({ Twilio: jest.fn() }));
jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));
jest.mock('../automation/automation-connections.service', () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ''),
}));

const audit = writeChainedAuditLog as jest.Mock;
const createTransport = nodemailer.createTransport as unknown as jest.Mock;
const TwilioMock = Twilio as unknown as jest.Mock;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const stored = (over: Record<string, object> = {}) => ({
  integrationSettingsJson: JSON.stringify({
    ...structuredClone(DEFAULT_INTEGRATION_SETTINGS),
    ...over,
  }),
});

describe('IntegrationSettingsService', () => {
  let prisma: any;
  let redis: { eval: jest.Mock; zcount: jest.Mock };
  let service: IntegrationSettingsService;
  const env = { ...process.env };

  const build = (withRedis = true) => {
    service = new IntegrationSettingsService(prisma, (withRedis ? redis : undefined) as never);
  };
  // Define as definições guardadas e recria o serviço (a cache de 30s esconderia a mudança).
  const withSettings = (over: Record<string, object>, withRedis = true) => {
    prisma.tenantConfig.findUnique.mockResolvedValue(stored(over));
    prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue(stored(over));
    build(withRedis);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_HOST;
    prisma = {
      tenantConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ integrationSettingsJson: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findUnique: jest.fn() },
      integrationConfig: { groupBy: jest.fn().mockResolvedValue([]) },
      apiKey: { count: jest.fn().mockResolvedValue(0) },
      webhook: { count: jest.fn().mockResolvedValue(0) },
    };
    prisma.read = prisma;
    redis = { eval: jest.fn().mockResolvedValue(1), zcount: jest.fn().mockResolvedValue(0) };
    build();
  });

  afterAll(() => {
    process.env = env;
  });

  describe('update', () => {
    const saved = () =>
      JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.integrationSettingsJson);

    it('cifra a password SMTP e o token Twilio; nunca grava o campo em claro', async () => {
      await service.update({
        smtp: { host: 'mail.x', password: 'pw-smtp' },
        whatsapp: { authToken: 'tok' },
      } as never);
      expect(saved().smtp).not.toHaveProperty('password');
      expect(saved().smtp.passEnc).toBe('enc:pw-smtp');
      expect(saved().whatsapp).not.toHaveProperty('authToken');
      expect(saved().whatsapp.authTokenEnc).toBe('enc:tok');
    });

    it('omitir o segredo mantém, "" apaga', async () => {
      withSettings({
        smtp: { ...DEFAULT_INTEGRATION_SETTINGS.smtp, host: 'h', passEnc: 'enc:antigo' },
      });
      await service.update({ smtp: { port: 25 } } as never);
      expect(saved().smtp).toMatchObject({ port: 25, passEnc: 'enc:antigo' });

      prisma.tenantConfig.update.mockClear();
      await service.update({ smtp: { password: '' } } as never);
      expect(saved().smtp.passEnc).toBeNull();
    });

    it('ignora campos undefined em vez de apagar valores guardados', async () => {
      withSettings({
        smtp: { ...DEFAULT_INTEGRATION_SETTINGS.smtp, host: 'mail.x', from: 'a@b.c' },
      });
      await service.update({ smtp: { host: undefined, port: 2525 } } as never);
      expect(saved().smtp).toMatchObject({ host: 'mail.x', from: 'a@b.c', port: 2525 });
    });

    describe('activar WhatsApp via Twilio exige credenciais completas', () => {
      const wa = (over: object) =>
        ({ whatsapp: { enabled: true, provider: 'TWILIO', ...over } }) as never;

      it.each([
        ['sem número', { accountSid: 'AC1', authToken: 't' }],
        ['sem Account SID', { number: '+244900', authToken: 't' }],
        ['sem token', { number: '+244900', accountSid: 'AC1' }],
      ])('%s → 400 e nada é gravado', async (_n, over) => {
        await expect(service.update(wa(over))).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
      });

      it('com tudo preenchido grava', async () => {
        await expect(
          service.update(wa({ number: '+244900', accountSid: 'AC1', authToken: 't' })),
        ).resolves.toBeDefined();
      });

      it('um token já guardado conta como preenchido', async () => {
        withSettings({
          whatsapp: {
            ...DEFAULT_INTEGRATION_SETTINGS.whatsapp,
            number: '+244900',
            accountSid: 'AC1',
            authTokenEnc: 'enc:t',
          },
        });
        await expect(service.update(wa({}))).resolves.toBeDefined();
      });

      it('com fornecedor META não exige as credenciais Twilio', async () => {
        await expect(
          service.update({ whatsapp: { enabled: true, provider: 'META' } } as never),
        ).resolves.toBeDefined();
      });
    });

    it('a auditoria nunca contém segredos, só indica que mudaram', async () => {
      await service.update(
        { smtp: { password: 'pw-secreta' }, whatsapp: { authToken: 'tok-secreto' } } as never,
        4,
      );
      const call = audit.mock.calls[0][1];
      expect(call).toMatchObject({
        userId: 4,
        action: 'SETTINGS_INTEGRATIONS_UPDATE',
        severity: 'HIGH',
      });
      expect(call.metadata).not.toMatch(/pw-secreta|tok-secreto/);
      expect(JSON.parse(call.metadata)).toMatchObject({
        smtpPasswordChanged: true,
        whatsappTokenChanged: true,
      });
    });

    it('invalida a cache e devolve a vista pública (sem segredos)', async () => {
      await service.get(); // aquece a cache
      const view = await service.update({ smtp: { password: 'x' } } as never);
      expect(JSON.stringify(view)).not.toMatch(/passEnc|enc:x/);
      expect(prisma.tenantConfig.findUnique.mock.calls.length).toBeGreaterThan(1);
    });

    it('falha a auditar não impede a gravação', async () => {
      audit.mockRejectedValueOnce(new Error('x'));
      await expect(service.update({ isis: { enabled: false } } as never)).resolves.toBeDefined();
    });
  });

  describe('getSmtp', () => {
    it('sem host guardado → null (usa as variáveis de ambiente)', async () => {
      await expect(service.getSmtp()).resolves.toBeNull();
    });

    it('decifra a password e força TLS na porta 465', async () => {
      withSettings({
        smtp: {
          host: 'mail.x',
          port: 465,
          secure: false,
          user: 'u',
          passEnc: 'enc:pw',
          from: 'N <n@x>',
        },
      });
      await expect(service.getSmtp()).resolves.toEqual({
        host: 'mail.x',
        port: 465,
        secure: true,
        user: 'u',
        pass: 'pw',
        from: 'N <n@x>',
      });
    });

    it('sem passEnc a password é vazia; "from" cai na variável de ambiente e depois num default', async () => {
      withSettings({ smtp: { ...DEFAULT_INTEGRATION_SETTINGS.smtp, host: 'mail.x' } });
      expect((await service.getSmtp())!.pass).toBe('');
      expect((await service.getSmtp())!.from).toBe('INNOVA <noreply@innova.ao>');

      process.env.SMTP_FROM = 'Env <env@x>';
      withSettings({ smtp: { ...DEFAULT_INTEGRATION_SETTINGS.smtp, host: 'mail.x' } });
      expect((await service.getSmtp())!.from).toBe('Env <env@x>');
    });
  });

  describe('testSmtp', () => {
    const transporter = { verify: jest.fn(), sendMail: jest.fn() };
    beforeEach(() => {
      transporter.verify.mockReset().mockResolvedValue(true);
      transporter.sendMail.mockReset().mockResolvedValue({});
      createTransport.mockReturnValue(transporter);
      withSettings({
        smtp: {
          host: 'mail.x',
          port: 587,
          secure: false,
          user: 'u',
          passEnc: 'enc:pw',
          from: 'N <n@x>',
        },
      });
    });

    it('sem SMTP configurado → 400, sem abrir ligação', async () => {
      withSettings({});
      await expect(service.testSmtp('a@b.c', 1)).rejects.toThrow(/SMTP não configurado/);
      expect(createTransport).not.toHaveBeenCalled();
    });

    it('sem destinatário nem email do admin → 400', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.testSmtp(undefined, 1)).rejects.toThrow(/destinatário/);
    });

    it('sem "to" usa o email do admin que pediu o teste', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'admin@x.com' });
      await expect(service.testSmtp(undefined, 1)).resolves.toEqual({
        ok: true,
        to: 'admin@x.com',
      });
      expect(transporter.sendMail.mock.calls[0][0]).toMatchObject({
        to: 'admin@x.com',
        from: 'N <n@x>',
      });
    });

    it('verifica a ligação com credenciais decifradas e timeout, antes de enviar', async () => {
      await service.testSmtp('a@b.c', 1);
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'mail.x',
          auth: { user: 'u', pass: 'pw' },
          connectionTimeout: 10_000,
        }),
      );
      expect(transporter.verify.mock.invocationCallOrder[0]).toBeLessThan(
        transporter.sendMail.mock.invocationCallOrder[0],
      );
    });

    it('sem utilizador SMTP não envia auth', async () => {
      withSettings({ smtp: { ...DEFAULT_INTEGRATION_SETTINGS.smtp, host: 'relay.x' } });
      await service.testSmtp('a@b.c', 1);
      expect(createTransport.mock.calls[0][0].auth).toBeUndefined();
    });

    it('falha de verificação → ok:false com a mensagem, sem lançar nem enviar', async () => {
      transporter.verify.mockRejectedValue(new Error('535 auth failed'));
      await expect(service.testSmtp('a@b.c', 1)).resolves.toEqual({
        ok: false,
        error: '535 auth failed',
      });
      expect(transporter.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('WhatsApp — credenciais', () => {
    const wa = (over: object) => ({
      whatsapp: {
        ...DEFAULT_INTEGRATION_SETTINGS.whatsapp,
        enabled: true,
        number: '+244900',
        accountSid: 'AC1',
        authTokenEnc: 'enc:tok',
        ...over,
      },
    });

    it('devolve credenciais decifradas quando activo, Twilio e com token', async () => {
      withSettings(wa({}));
      await expect(service.getWhatsApp()).resolves.toEqual({
        accountSid: 'AC1',
        authToken: 'tok',
        from: '+244900',
      });
    });

    it.each([
      ['desligado', { enabled: false }],
      ['fornecedor META', { provider: 'META' }],
      ['sem token', { authTokenEnc: null }],
    ])('%s → null (cai nas variáveis de ambiente)', async (_n, over) => {
      withSettings(wa(over));
      await expect(service.getWhatsApp()).resolves.toBeNull();
    });

    it('isWhatsAppEnabledInSettings: null se nunca configurado, senão o valor de "enabled"', async () => {
      await expect(service.isWhatsAppEnabledInSettings()).resolves.toBeNull();
      withSettings(wa({ enabled: false }));
      await expect(service.isWhatsAppEnabledInSettings()).resolves.toBe(false);
    });
  });

  describe('consumeWhatsAppQuota', () => {
    it('com Redis delega no script Lua (verificação+consumo atómicos) com os limites', async () => {
      withSettings({
        whatsapp: { ...DEFAULT_INTEGRATION_SETTINGS.whatsapp, hourlyLimit: 10, dailyLimit: 100 },
      });
      await expect(service.consumeWhatsAppQuota()).resolves.toBe(true);
      const args = redis.eval.mock.calls[0];
      expect(args[1]).toBe(1);
      expect(args[2]).toBe('innova:whatsapp:sent');
      expect(args.slice(4, 8)).toEqual([HOUR, DAY, 10, 100]);
    });

    it('quota excedida no Redis (0) → false', async () => {
      redis.eval.mockResolvedValue(0);
      await expect(service.consumeWhatsAppQuota()).resolves.toBe(false);
    });

    describe('sem Redis (contagem local)', () => {
      const local = (whatsapp: object = {}) =>
        withSettings(
          { whatsapp: { ...DEFAULT_INTEGRATION_SETTINGS.whatsapp, ...whatsapp } },
          false,
        );

      it('0 = sem limite', async () => {
        local();
        for (let i = 0; i < 50; i++)
          await expect(service.consumeWhatsAppQuota()).resolves.toBe(true);
      });

      it('respeita o limite por hora', async () => {
        local({ hourlyLimit: 2 });
        expect(await service.consumeWhatsAppQuota()).toBe(true);
        expect(await service.consumeWhatsAppQuota()).toBe(true);
        expect(await service.consumeWhatsAppQuota()).toBe(false);
      });

      it('respeita o limite por dia', async () => {
        local({ dailyLimit: 1 });
        expect(await service.consumeWhatsAppQuota()).toBe(true);
        expect(await service.consumeWhatsAppQuota()).toBe(false);
      });

      it('um envio recusado não consome quota', async () => {
        local({ dailyLimit: 1 });
        await service.consumeWhatsAppQuota();
        await service.consumeWhatsAppQuota();
        await service.consumeWhatsAppQuota();
        expect((service as any).waSent).toHaveLength(1);
      });

      it('a janela desliza: após 1h o limite horário liberta; após 24h o diário também', async () => {
        local({ hourlyLimit: 1, dailyLimit: 2 });
        const now = jest.spyOn(Date, 'now');
        now.mockReturnValue(1_000_000_000);
        expect(await service.consumeWhatsAppQuota()).toBe(true);
        expect(await service.consumeWhatsAppQuota()).toBe(false); // hora cheia
        now.mockReturnValue(1_000_000_000 + HOUR + 1);
        expect(await service.consumeWhatsAppQuota()).toBe(true);
        expect(await service.consumeWhatsAppQuota()).toBe(false); // dia cheio (2)
        now.mockReturnValue(1_000_000_000 + DAY + HOUR + 2);
        expect(await service.consumeWhatsAppQuota()).toBe(true);
        now.mockRestore();
      });
    });

    it('Redis em baixo → cai para a contagem local em vez de bloquear os envios', async () => {
      redis.eval.mockRejectedValue(new Error('ECONNREFUSED'));
      withSettings({ whatsapp: { ...DEFAULT_INTEGRATION_SETTINGS.whatsapp, dailyLimit: 1 } });
      expect(await service.consumeWhatsAppQuota()).toBe(true);
      expect(await service.consumeWhatsAppQuota()).toBe(false);
    });
  });

  describe('whatsAppStatus', () => {
    const configured = (withRedis = true) =>
      withSettings(
        {
          whatsapp: {
            ...DEFAULT_INTEGRATION_SETTINGS.whatsapp,
            enabled: true,
            number: '+244900',
            accountSid: 'AC1',
            authTokenEnc: 'enc:tok',
            hourlyLimit: 5,
            dailyLimit: 50,
          },
        },
        withRedis,
      );
    const twilioFetch = (fetch: jest.Mock) =>
      TwilioMock.mockImplementation(() => ({ api: { accounts: () => ({ fetch }) } }));

    it('sem credenciais completas → não ligado, sem chamar o Twilio', async () => {
      const res = await service.whatsAppStatus();
      expect(res).toMatchObject({ enabled: false, connected: false });
      expect(TwilioMock).not.toHaveBeenCalled();
    });

    it('conta activa → ligado, com o consumo e os limites', async () => {
      configured();
      redis.zcount.mockResolvedValueOnce(2).mockResolvedValueOnce(9);
      twilioFetch(jest.fn().mockResolvedValue({ status: 'active' }));
      await expect(service.whatsAppStatus()).resolves.toEqual({
        enabled: true,
        connected: true,
        providerStatus: 'active',
        usage: { lastHour: 2, lastDay: 9, hourlyLimit: 5, dailyLimit: 50 },
      });
    });

    it('conta suspensa → não ligado, mas mostra o estado do fornecedor', async () => {
      configured();
      twilioFetch(jest.fn().mockResolvedValue({ status: 'suspended' }));
      expect(await service.whatsAppStatus()).toMatchObject({
        connected: false,
        providerStatus: 'suspended',
      });
    });

    it('erro do Twilio → mensagem genérica (não vaza o erro nem credenciais)', async () => {
      configured();
      twilioFetch(jest.fn().mockRejectedValue(new Error('Authenticate AC1:tok')));
      const res = (await service.whatsAppStatus()) as { error: string };
      expect(res.error).toBe('Credenciais rejeitadas ou serviço indisponível');
      expect(JSON.stringify(res)).not.toContain('tok');
    });

    it('sem Redis, o consumo vem da contagem local', async () => {
      configured(false);
      await service.consumeWhatsAppQuota();
      const res = await service.whatsAppStatus();
      expect(res.usage).toMatchObject({ lastHour: 1, lastDay: 1 });
    });
  });

  describe('assertIsisAllowed', () => {
    it('desactivada → 400', async () => {
      withSettings({ isis: { enabled: false, enabledModules: [], dailyLimitPerUser: 0 } });
      await expect(service.assertIsisAllowed('PDI')).rejects.toThrow(/desactivada/);
    });

    it('lista de módulos vazia significa todos', async () => {
      await expect(service.assertIsisAllowed('PDI')).resolves.toBeUndefined();
    });

    it('módulo fora da lista → 400 com o nome do módulo', async () => {
      withSettings({ isis: { enabled: true, enabledModules: ['LEARNING'], dailyLimitPerUser: 0 } });
      await expect(service.assertIsisAllowed('PDI')).rejects.toThrow(/módulo PDI/);
      await expect(service.assertIsisAllowed('LEARNING')).resolves.toBeUndefined();
    });

    it('sem módulo indicado só verifica se está activa', async () => {
      withSettings({ isis: { enabled: true, enabledModules: ['LEARNING'], dailyLimitPerUser: 0 } });
      await expect(service.assertIsisAllowed()).resolves.toBeUndefined();
    });
  });

  describe('overview', () => {
    it('indica a origem do SMTP: nenhuma/ambiente, ambiente ou definições', async () => {
      expect((await service.overview()).smtp).toEqual({ configured: false, source: 'env' });
      process.env.SMTP_HOST = 'env-host';
      expect((await service.overview()).smtp).toEqual({ configured: true, source: 'env' });
      withSettings({ smtp: { ...DEFAULT_INTEGRATION_SETTINGS.smtp, host: 'mail.x' } });
      expect((await service.overview()).smtp).toEqual({ configured: true, source: 'settings' });
    });

    it('agrega integrações por estado e conta só chaves e webhooks activos', async () => {
      prisma.integrationConfig.groupBy.mockResolvedValue([
        { status: 'ACTIVE', _count: { _all: 3 } },
        { status: 'ERROR', _count: { _all: 1 } },
      ]);
      prisma.apiKey.count.mockResolvedValue(4);
      prisma.webhook.count.mockResolvedValue(2);
      const o = await service.overview();
      expect(o).toMatchObject({
        integrationsByStatus: { ACTIVE: 3, ERROR: 1 },
        activeApiKeys: 4,
        activeWebhooks: 2,
      });
      expect(prisma.apiKey.count).toHaveBeenCalledWith({ where: { active: true } });
      expect(prisma.webhook.count).toHaveBeenCalledWith({ where: { active: true } });
    });
  });
});
