import { BadRequestException } from '@nestjs/common';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import {
  DEFAULT_WHATSAPP_EXTRA,
  WHATSAPP_EVENT_KEYS,
  parseWhatsAppExtra,
  publicWhatsAppExtra,
} from './whatsapp-settings';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

const twilioCreate = jest.fn();
jest.mock('twilio', () => ({
  Twilio: jest
    .fn()
    .mockImplementation(() => ({ messages: { create: (...a: unknown[]) => twilioCreate(...a) } })),
}));
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

describe('whatsapp-settings (helpers puros)', () => {
  it.each([null, undefined, ''])('defaults para %p', raw => {
    expect(parseWhatsAppExtra(raw)).toEqual(DEFAULT_WHATSAPP_EXTRA);
  });

  it('JSON inválido cai nos defaults', () => {
    expect(parseWhatsAppExtra('{x')).toEqual(DEFAULT_WHATSAPP_EXTRA);
  });

  it('fornecedor desconhecido volta a TWILIO', () => {
    expect(parseWhatsAppExtra(JSON.stringify({ provider: 'TELEGRAM' })).provider).toBe('TWILIO');
    expect(parseWhatsAppExtra(JSON.stringify({ provider: 'META' })).provider).toBe('META');
  });

  it('eventos autorizados: descarta valores desconhecidos; não-lista → todos', () => {
    expect(
      parseWhatsAppExtra(JSON.stringify({ authorizedEvents: ['AUTOMATION', 'HACK', 1] }))
        .authorizedEvents,
    ).toEqual(['AUTOMATION']);
    expect(parseWhatsAppExtra(JSON.stringify({ authorizedEvents: 'x' })).authorizedEvents).toEqual([
      ...WHATSAPP_EVENT_KEYS,
    ]);
    expect(parseWhatsAppExtra(JSON.stringify({ authorizedEvents: [] })).authorizedEvents).toEqual(
      [],
    );
  });

  it('templates: um por evento, com merge parcial e sem chaves fantasma', () => {
    const s = parseWhatsAppExtra(
      JSON.stringify({ templates: { NOTIFICATION: { name: 'tpl_notif' }, HACK: { name: 'x' } } }),
    );
    expect(Object.keys(s.templates).sort()).toEqual([...WHATSAPP_EVENT_KEYS].sort());
    expect(s.templates.NOTIFICATION).toEqual({ name: 'tpl_notif', language: 'pt_PT' });
  });

  it('a vista pública esconde o token Meta e indica se existe', () => {
    const s = parseWhatsAppExtra(
      JSON.stringify({ meta: { phoneNumberId: '1', accessTokenEnc: 'CIFRADO' } }),
    );
    const pub = publicWhatsAppExtra(s);
    expect(JSON.stringify(pub)).not.toContain('CIFRADO');
    expect(pub.meta.hasAccessToken).toBe(true);
    expect(publicWhatsAppExtra(parseWhatsAppExtra(null)).meta.hasAccessToken).toBe(false);
  });
});

describe('WhatsAppSettingsService', () => {
  let prisma: any;
  let integrations: Record<string, jest.Mock>;
  let service: WhatsAppSettingsService;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  const metaStored = (extra: object = {}) =>
    JSON.stringify({
      provider: 'META',
      meta: {
        phoneNumberId: '555',
        businessAccountId: 'WABA1',
        accessTokenEnc: 'enc:meta-tok',
        apiVersion: 'v20.0',
      },
      ...extra,
    });
  const withStored = (json: string | null) => {
    prisma.tenantConfig.findUnique.mockResolvedValue({ whatsappSettingsJson: json });
    service = new WhatsAppSettingsService(prisma, integrations as never);
  };
  const saved = () =>
    JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.whatsappSettingsJson);
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
  const fail = (status: number, body: unknown = {}) =>
    ({ ok: false, status, json: async () => body }) as Response;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    integrations = {
      getWhatsAppBase: jest
        .fn()
        .mockResolvedValue({ enabled: false, number: '', authTokenEnc: null }),
      getWhatsApp: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      whatsAppStatus: jest
        .fn()
        .mockResolvedValue({ enabled: false, connected: false, usage: { lastHour: 0 } }),
    };
    service = new WhatsAppSettingsService(prisma, integrations as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('get', () => {
    it('junta a base (sem token) com as definições extra públicas e o estado', async () => {
      integrations.getWhatsAppBase.mockResolvedValue({
        enabled: true,
        number: '+244900',
        authTokenEnc: 'enc:t',
      });
      const v = await service.get();
      expect(v).toMatchObject({
        enabled: true,
        number: '+244900',
        hasAuthToken: true,
        provider: 'TWILIO',
        eventOptions: WHATSAPP_EVENT_KEYS,
      });
      expect(JSON.stringify(v)).not.toMatch(/enc:|authTokenEnc|accessTokenEnc/);
      expect(integrations.whatsAppStatus).toHaveBeenCalled(); // Twilio delega no serviço de integrações
    });
  });

  describe('update', () => {
    it('cifra o token Meta; omitir mantém, "" apaga', async () => {
      await service.update({ meta: { phoneNumberId: '9', accessToken: 'novo' } } as never);
      expect(saved().meta.accessTokenEnc).toBe('enc:novo');
      expect(saved().meta).not.toHaveProperty('accessToken');

      withStored(metaStored());
      prisma.tenantConfig.update.mockClear();
      await service.update({ meta: { phoneNumberId: '10' } } as never);
      expect(saved().meta).toMatchObject({ phoneNumberId: '10', accessTokenEnc: 'enc:meta-tok' });

      prisma.tenantConfig.update.mockClear();
      await service.update({ meta: { accessToken: '' } } as never);
      expect(saved().meta.accessTokenEnc).toBeNull();
    });

    it('activar via Meta exige Phone Number ID e token — e nada é gravado antes disso', async () => {
      await expect(
        service.update({ provider: 'META', enabled: true } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(integrations.update).not.toHaveBeenCalled();
      expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
    });

    it('já activo + fornecedor Meta sem credenciais também é recusado', async () => {
      integrations.getWhatsAppBase.mockResolvedValue({ enabled: true, authTokenEnc: null });
      await expect(service.update({ provider: 'META' } as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('com credenciais Meta completas aceita', async () => {
      await expect(
        service.update({
          provider: 'META',
          enabled: true,
          meta: { phoneNumberId: '5', accessToken: 'tok' },
        } as never),
      ).resolves.toBeDefined();
    });

    it('grava primeiro a base (valida Twilio) e só depois a parte Meta', async () => {
      await service.update({ provider: 'TWILIO', number: '+244900', hourlyLimit: 5 } as never, 4);
      expect(integrations.update).toHaveBeenCalledWith(
        {
          whatsapp: expect.objectContaining({
            provider: 'TWILIO',
            number: '+244900',
            hourlyLimit: 5,
          }),
        },
        4,
      );
      expect(integrations.update.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.tenantConfig.update.mock.invocationCallOrder[0],
      );
    });

    it('se a base for recusada (credenciais Twilio incompletas) nada da parte Meta é gravado', async () => {
      integrations.update.mockRejectedValue(new BadRequestException('Twilio incompleto'));
      await expect(service.update({ enabled: true } as never)).rejects.toThrow('Twilio incompleto');
      expect(prisma.tenantConfig.update).not.toHaveBeenCalled();
    });

    it('templates: merge só dos eventos conhecidos, ignorando undefined e chaves inventadas', async () => {
      withStored(
        JSON.stringify({ templates: { AUTOMATION: { name: 'tpl_auto', language: 'pt_AO' } } }),
      );
      await service.update({
        templates: { AUTOMATION: { name: undefined, language: 'en_US' }, HACK: { name: 'x' } },
      } as never);
      expect(saved().templates.AUTOMATION).toEqual({ name: 'tpl_auto', language: 'en_US' });
      expect(saved().templates).not.toHaveProperty('HACK');
    });

    it('substitui a lista de eventos autorizados quando enviada', async () => {
      await service.update({ authorizedEvents: ['NOTIFICATION'] } as never);
      expect(saved().authorizedEvents).toEqual(['NOTIFICATION']);
    });

    it('a auditoria nunca contém segredos', async () => {
      await service.update(
        {
          meta: { accessToken: 'meta-secreto' },
          authToken: 'twilio-secreto',
          enabled: false,
        } as never,
        4,
      );
      const call = audit.mock.calls[0][1];
      expect(call).toMatchObject({ action: 'SETTINGS_WHATSAPP_UPDATE', severity: 'HIGH' });
      expect(call.metadata).not.toMatch(/meta-secreto|twilio-secreto/);
      expect(JSON.parse(call.metadata).metaTokenChanged).toBe(true);
    });

    it('invalida a cache', async () => {
      await service.getProvider();
      await service.update({ authorizedEvents: [] } as never);
      await service.getProvider();
      // 1.ª leitura + releitura depois da invalidação (o update reutilizou a cache)
      expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('fornecedor e eventos', () => {
    it('getProvider lê o fornecedor guardado', async () => {
      withStored(metaStored());
      await expect(service.getProvider()).resolves.toBe('META');
    });

    it('isEventAuthorized: sem evento é sempre permitido', async () => {
      withStored(JSON.stringify({ authorizedEvents: [] }));
      await expect(service.isEventAuthorized(undefined)).resolves.toBe(true);
    });

    it('só autoriza os eventos da lista; desconhecidos são recusados', async () => {
      withStored(JSON.stringify({ authorizedEvents: ['AUTOMATION'] }));
      await expect(service.isEventAuthorized('AUTOMATION')).resolves.toBe(true);
      await expect(service.isEventAuthorized('NOTIFICATION')).resolves.toBe(false);
      await expect(service.isEventAuthorized('QUALQUER')).resolves.toBe(false);
    });
  });

  describe('sendMeta', () => {
    beforeEach(() => withStored(metaStored()));

    it('sem credenciais Meta → erro explícito, sem rede', async () => {
      withStored(null);
      await expect(service.sendMeta('+244900', 'olá')).rejects.toThrow(/sem credenciais/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('texto livre quando não há template; remove o "+" do número; usa token decifrado e versão da API', async () => {
      fetchMock.mockResolvedValue(ok({}));
      await service.sendMeta('+244900111222', 'olá');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/v20.0/555/messages');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer meta-tok');
      expect(JSON.parse(init.body)).toEqual({
        messaging_product: 'whatsapp',
        to: '244900111222',
        type: 'text',
        text: { body: 'olá' },
      });
    });

    it('usa o template aprovado do evento quando configurado', async () => {
      withStored(
        metaStored({ templates: { AUTOMATION: { name: 'tpl_auto', language: 'pt_AO' } } }),
      );
      fetchMock.mockResolvedValue(ok({}));
      await service.sendMeta('+244900', 'corpo', 'AUTOMATION');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe('template');
      expect(body.template).toMatchObject({
        name: 'tpl_auto',
        language: { code: 'pt_AO' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'corpo' }] }],
      });
    });

    it('evento sem template (nome vazio) cai em texto livre', async () => {
      fetchMock.mockResolvedValue(ok({}));
      await service.sendMeta('+244900', 'corpo', 'NOTIFICATION');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).type).toBe('text');
    });

    it('erro da Graph API → lança com a mensagem da Meta; sem mensagem usa o código HTTP', async () => {
      fetchMock.mockResolvedValueOnce(fail(400, { error: { message: 'Invalid OAuth token' } }));
      await expect(service.sendMeta('+244900', 'x')).rejects.toThrow('Invalid OAuth token');
      fetchMock.mockResolvedValueOnce(fail(502));
      await expect(service.sendMeta('+244900', 'x')).rejects.toThrow(/respondeu 502/);
    });
  });

  describe('estado (Meta)', () => {
    it('sem credenciais → não ligado, com o consumo', async () => {
      withStored(JSON.stringify({ provider: 'META' }));
      integrations.getWhatsAppBase.mockResolvedValue({ enabled: true, authTokenEnc: null });
      integrations.whatsAppStatus.mockResolvedValue({ usage: { lastHour: 1 } });
      expect((await service.get()).status).toEqual({
        enabled: true,
        connected: false,
        usage: { lastHour: 1 },
      });
    });

    it('ligado: devolve número, nome verificado e qualidade', async () => {
      withStored(metaStored());
      integrations.whatsAppStatus.mockResolvedValue({ usage: { lastHour: 0 } });
      fetchMock.mockResolvedValue(
        ok({ display_phone_number: '+244 900', verified_name: 'INNOVA', quality_rating: 'GREEN' }),
      );
      expect((await service.get()).status).toMatchObject({
        connected: true,
        displayPhoneNumber: '+244 900',
        verifiedName: 'INNOVA',
        qualityRating: 'GREEN',
      });
    });

    it('falha da Meta → mensagem genérica, sem vazar o erro', async () => {
      withStored(metaStored());
      integrations.whatsAppStatus.mockResolvedValue({ usage: {} });
      fetchMock.mockResolvedValue(fail(401, { error: { message: 'Token meta-tok expirado' } }));
      const status = (await service.get()).status as { error: string };
      expect(status.error).toBe('Credenciais rejeitadas ou serviço indisponível');
      expect(JSON.stringify(status)).not.toContain('meta-tok');
    });
  });

  describe('listMetaTemplates', () => {
    it('exige Business Account ID e token', async () => {
      withStored(
        JSON.stringify({ provider: 'META', meta: { phoneNumberId: '1', accessTokenEnc: 'enc:t' } }),
      );
      await expect(service.listMetaTemplates()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('devolve os templates da conta', async () => {
      withStored(metaStored());
      fetchMock.mockResolvedValue(
        ok({ data: [{ name: 'tpl', language: 'pt_PT', status: 'APPROVED', category: 'UTILITY' }] }),
      );
      await expect(service.listMetaTemplates()).resolves.toHaveLength(1);
      expect(fetchMock.mock.calls[0][0]).toContain('WABA1/message_templates');
    });

    it('erro da Meta vira 400 com a mensagem', async () => {
      withStored(metaStored());
      fetchMock.mockResolvedValue(fail(403, { error: { message: 'Permissão em falta' } }));
      await expect(service.listMetaTemplates()).rejects.toThrow('Permissão em falta');
    });
  });

  describe('sendTest', () => {
    it('WhatsApp desactivado → 400', async () => {
      await expect(service.sendTest('+244900', 1)).rejects.toThrow(/desactivado/);
    });

    describe('Twilio', () => {
      beforeEach(() => {
        integrations.getWhatsAppBase.mockResolvedValue({ enabled: true });
        integrations.getWhatsApp.mockResolvedValue({
          accountSid: 'AC1',
          authToken: 't',
          from: 'whatsapp:+1415',
        });
      });

      it('envia com o prefixo whatsapp: sem o duplicar no remetente, e audita (LOW)', async () => {
        twilioCreate.mockResolvedValue({});
        await expect(service.sendTest('+244900', 1)).resolves.toEqual({ ok: true });
        expect(twilioCreate).toHaveBeenCalledWith(
          expect.objectContaining({ to: 'whatsapp:+244900', from: 'whatsapp:+1415' }),
        );
        expect(audit.mock.calls[0][1]).toMatchObject({
          action: 'SETTINGS_WHATSAPP_TEST',
          severity: 'LOW',
        });
      });

      it('sem credenciais → ok:false e sem auditoria de sucesso', async () => {
        integrations.getWhatsApp.mockResolvedValue(null);
        await expect(service.sendTest('+244900', 1)).resolves.toEqual({
          ok: false,
          error: 'Credenciais Twilio em falta',
        });
        expect(audit).not.toHaveBeenCalled();
      });

      it('erro do Twilio → ok:false com a mensagem (não lança)', async () => {
        twilioCreate.mockRejectedValue(new Error('63007 channel not found'));
        await expect(service.sendTest('+244900', 1)).resolves.toEqual({
          ok: false,
          error: '63007 channel not found',
        });
      });
    });

    it('Meta: envia texto livre pela Graph API', async () => {
      integrations.getWhatsAppBase.mockResolvedValue({ enabled: true });
      withStored(metaStored());
      fetchMock.mockResolvedValue(ok({}));
      await expect(service.sendTest('+244900', 1)).resolves.toEqual({ ok: true });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).type).toBe('text');
    });
  });
});
