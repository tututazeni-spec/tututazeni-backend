import { BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailSettingsService } from './email-settings.service';
import {
  DEFAULT_EMAIL_SETTINGS,
  EMAIL_TEMPLATE_KEYS,
  parseEmailSettings,
  renderEmailTemplate,
} from './email-settings';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));

const audit = writeChainedAuditLog as jest.Mock;
const createTransport = nodemailer.createTransport as unknown as jest.Mock;

describe('email-settings (helpers puros)', () => {
  describe('parseEmailSettings', () => {
    it.each([null, undefined, ''])('defaults para %p', raw => {
      expect(parseEmailSettings(raw)).toEqual(DEFAULT_EMAIL_SETTINGS);
    });

    it('JSON inválido cai nos defaults', () => {
      expect(parseEmailSettings('{x')).toEqual(DEFAULT_EMAIL_SETTINGS);
    });

    it('migra templates antigos: {{tempPassword}} passa a {{setupLink}} (nunca enviar password por email)', () => {
      const s = parseEmailSettings(
        JSON.stringify({
          templates: {
            USER_INVITE: { body: 'A sua password: {{tempPassword}} / {{tempPassword}}' },
          },
        }),
      );
      expect(s.templates.USER_INVITE.body).toBe('A sua password: {{setupLink}} / {{setupLink}}');
      expect(JSON.stringify(s)).not.toContain('tempPassword');
    });

    it('faz merge de templates parciais com os defaults', () => {
      const s = parseEmailSettings(
        JSON.stringify({ templates: { PASSWORD_RESET: { subject: 'Novo assunto' } } }),
      );
      expect(s.templates.PASSWORD_RESET.subject).toBe('Novo assunto');
      expect(s.templates.PASSWORD_RESET.body).toBe(
        DEFAULT_EMAIL_SETTINGS.templates.PASSWORD_RESET.body,
      );
      expect(s.templates.USER_INVITE).toEqual(DEFAULT_EMAIL_SETTINGS.templates.USER_INVITE);
    });

    it('assinatura vazia é respeitada (não volta ao default)', () => {
      expect(parseEmailSettings(JSON.stringify({ signature: '' })).signature).toBe('');
    });
  });

  describe('renderEmailTemplate', () => {
    const settings = parseEmailSettings(null);

    it('substitui placeholders no assunto e no corpo e acrescenta a assinatura só ao corpo', () => {
      const out = renderEmailTemplate({ ...settings, signature: 'ASSINATURA' }, 'PASSWORD_RESET', {
        resetLink: 'https://x/reset?t=1',
      });
      expect(out.text).toContain('https://x/reset?t=1');
      expect(out.text.endsWith('\n\nASSINATURA')).toBe(true);
      expect(out.subject).not.toContain('ASSINATURA');
    });

    it('sem assinatura não acrescenta linhas em branco', () => {
      const out = renderEmailTemplate({ ...settings, signature: '' }, 'PASSWORD_RESET', {
        resetLink: 'l',
      });
      expect(out.text.endsWith('\n\n')).toBe(false);
    });

    it('placeholder desconhecido ou em falta vira vazio (nunca "undefined")', () => {
      const out = renderEmailTemplate(settings, 'USER_INVITE', { fullName: 'Ana' });
      expect(out.text).toContain('Olá Ana,');
      expect(out.text).not.toMatch(/undefined|\{\{/);
    });

    it('aceita números (expiryDays)', () => {
      const out = renderEmailTemplate(settings, 'USER_INVITE', {
        fullName: 'Ana',
        email: 'a@b.c',
        setupLink: 'l',
        expiryDays: 7,
      });
      expect(out.text).toContain('válido por 7 dias');
    });

    it('valores com "$&", "$1" ou "{{x}}" entram literalmente (sem re-expansão)', () => {
      const out = renderEmailTemplate(settings, 'USER_INVITE', {
        fullName: '$& $1 {{email}}',
        email: 'real@x.com',
        setupLink: 'l',
        expiryDays: 1,
      });
      expect(out.text).toContain('Olá $& $1 {{email}},');
    });
  });
});

describe('EmailSettingsService', () => {
  let prisma: any;
  let integrations: { get: jest.Mock; update: jest.Mock; getSmtp: jest.Mock };
  let service: EmailSettingsService;
  const env = process.env.APP_URL;

  const saved = () =>
    JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.emailSettingsJson);
  const withStored = (json: object) =>
    prisma.tenantConfig.findUnique.mockResolvedValue({ emailSettingsJson: JSON.stringify(json) });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { findUnique: jest.fn() },
    };
    prisma.read = prisma;
    integrations = {
      get: jest.fn().mockResolvedValue({ smtp: { host: 'mail.x', hasPassword: true } }),
      update: jest.fn().mockResolvedValue({}),
      getSmtp: jest.fn().mockResolvedValue({
        host: 'mail.x',
        port: 587,
        secure: false,
        user: 'u',
        pass: 'p',
        from: 'N <n@x>',
      }),
    };
    service = new EmailSettingsService(prisma, integrations as never);
  });

  afterAll(() => {
    if (env === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = env;
  });

  it('get junta o resumo SMTP (sem segredos) com templates, chaves e placeholders', async () => {
    const v = await service.get();
    expect(v.smtp).toEqual({ host: 'mail.x', hasPassword: true });
    expect(v.templateKeys).toEqual([...EMAIL_TEMPLATE_KEYS]);
    expect(v.placeholders.USER_INVITE).toContain('setupLink');
  });

  describe('update', () => {
    it('muda a assinatura e mantém os templates', async () => {
      await service.update({ signature: 'Nova' } as never, 4);
      expect(saved().signature).toBe('Nova');
      expect(saved().templates).toEqual(DEFAULT_EMAIL_SETTINGS.templates);
    });

    it('sem assinatura no DTO mantém a actual; assinatura vazia limpa-a', async () => {
      withStored({ signature: 'Antiga' });
      await service.update({} as never);
      expect(saved().signature).toBe('Antiga');
      prisma.tenantConfig.update.mockClear();
      await service.update({ signature: '' } as never);
      expect(saved().signature).toBe('');
    });

    it('um campo undefined num template não apaga o texto personalizado guardado', async () => {
      withStored({
        templates: { PASSWORD_RESET: { subject: 'S', body: 'Corpo personalizado {{resetLink}}' } },
      });
      await service.update({
        templates: { PASSWORD_RESET: { subject: 'Novo', body: undefined } },
      } as never);
      expect(saved().templates.PASSWORD_RESET).toEqual({
        subject: 'Novo',
        body: 'Corpo personalizado {{resetLink}}',
      });
    });

    it('só reencaminha o SMTP para as integrações quando vem no DTO', async () => {
      await service.update({ signature: 'x' } as never, 4);
      expect(integrations.update).not.toHaveBeenCalled();
      await service.update({ smtp: { host: 'novo.x' } } as never, 4);
      expect(integrations.update).toHaveBeenCalledWith({ smtp: { host: 'novo.x' } }, 4);
    });

    it('invalida a cache e audita (MEDIUM)', async () => {
      await service.render('PASSWORD_RESET', { resetLink: 'l' }); // aquece a cache
      await service.update({ signature: 'Nova' } as never, 4);
      const { text } = await service.render('PASSWORD_RESET', { resetLink: 'l' });
      expect(prisma.tenantConfig.findUnique.mock.calls.length).toBeGreaterThan(1);
      expect(text).toBeDefined();
      expect(audit.mock.calls[0][1]).toMatchObject({
        action: 'SETTINGS_EMAIL_UPDATE',
        severity: 'MEDIUM',
      });
    });
  });

  it('render usa a cache durante 30s', async () => {
    await service.render('PASSWORD_RESET', { resetLink: 'l' });
    await service.render('PASSWORD_RESET', { resetLink: 'l' });
    expect(prisma.tenantConfig.findUnique).toHaveBeenCalledTimes(1);
  });

  describe('testTemplate', () => {
    const transporter = { sendMail: jest.fn() };
    beforeEach(() => {
      transporter.sendMail.mockReset().mockResolvedValue({});
      createTransport.mockReturnValue(transporter);
      process.env.APP_URL = 'https://app.innova.test';
    });

    it('envia o template renderizado com dados de exemplo e devolve a pré-visualização', async () => {
      const res = await service.testTemplate('PASSWORD_RESET', 'a@b.c', 1);
      expect(res).toMatchObject({ ok: true, to: 'a@b.c' });
      const mail = transporter.sendMail.mock.calls[0][0];
      expect(mail.text).toContain('https://app.innova.test/auth/reset-password?token=EXEMPLO');
      expect(mail).toMatchObject({ from: 'N <n@x>', to: 'a@b.c' });
    });

    it('o convite de teste usa o destinatário como email de exemplo', async () => {
      await service.testTemplate('USER_INVITE', 'dest@x.com', 1);
      expect(transporter.sendMail.mock.calls[0][0].text).toContain('Email: dest@x.com');
    });

    it('sem "to" usa o email do admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'admin@x.com' });
      await expect(service.testTemplate('PASSWORD_RESET', undefined, 1)).resolves.toMatchObject({
        ok: true,
        to: 'admin@x.com',
      });
    });

    it('sem destinatário possível → ok:false (não lança, não abre ligação)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.testTemplate('PASSWORD_RESET', undefined, 1)).resolves.toEqual({
        ok: false,
        error: 'Sem destinatário para o email de teste',
      });
      expect(createTransport).not.toHaveBeenCalled();
    });

    it('sem SMTP configurado → 400', async () => {
      integrations.getSmtp.mockResolvedValue(null);
      await expect(service.testTemplate('PASSWORD_RESET', 'a@b.c', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('sem utilizador SMTP não envia auth; com utilizador envia as credenciais', async () => {
      await service.testTemplate('PASSWORD_RESET', 'a@b.c', 1);
      expect(createTransport.mock.calls[0][0].auth).toEqual({ user: 'u', pass: 'p' });
      integrations.getSmtp.mockResolvedValue({
        host: 'h',
        port: 25,
        secure: false,
        user: '',
        pass: '',
        from: 'f',
      });
      await service.testTemplate('PASSWORD_RESET', 'a@b.c', 1);
      expect(createTransport.mock.calls[1][0].auth).toBeUndefined();
    });

    it('erro de envio → ok:false com a mensagem', async () => {
      transporter.sendMail.mockRejectedValue(new Error('550 rejected'));
      await expect(service.testTemplate('PASSWORD_RESET', 'a@b.c', 1)).resolves.toEqual({
        ok: false,
        error: '550 rejected',
      });
    });
  });
});
