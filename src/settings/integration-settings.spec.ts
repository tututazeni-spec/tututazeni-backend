import {
  DEFAULT_INTEGRATION_SETTINGS,
  ISIS_MODULE_OPTIONS,
  parseIntegrationSettings,
  publicIntegrationSettings,
} from './integration-settings';

describe('integration-settings (helpers puros)', () => {
  describe('parseIntegrationSettings', () => {
    it.each([null, undefined, ''])('defaults para %p', raw => {
      expect(parseIntegrationSettings(raw)).toEqual(DEFAULT_INTEGRATION_SETTINGS);
    });

    it('JSON inválido cai nos defaults', () => {
      expect(parseIntegrationSettings('{x')).toEqual(DEFAULT_INTEGRATION_SETTINGS);
    });

    it('defaults seguros: WhatsApp desligado, sem SMTP, Ísis ligada a todos os módulos', () => {
      expect(DEFAULT_INTEGRATION_SETTINGS.whatsapp.enabled).toBe(false);
      expect(DEFAULT_INTEGRATION_SETTINGS.smtp.host).toBe('');
      expect(DEFAULT_INTEGRATION_SETTINGS.isis).toMatchObject({ enabled: true, enabledModules: [] });
    });

    it('devolve cópia profunda', () => {
      const s = parseIntegrationSettings(null);
      s.isis.enabledModules.push('PDI');
      s.smtp.host = 'x';
      expect(DEFAULT_INTEGRATION_SETTINGS.isis.enabledModules).toEqual([]);
      expect(DEFAULT_INTEGRATION_SETTINGS.smtp.host).toBe('');
    });

    it('faz merge parcial por secção', () => {
      const s = parseIntegrationSettings(JSON.stringify({ smtp: { host: 'mail.x', port: 465 } }));
      expect(s.smtp).toMatchObject({ host: 'mail.x', port: 465, secure: false });
      expect(s.whatsapp.provider).toBe('TWILIO');
    });
  });

  describe('publicIntegrationSettings', () => {
    const s = parseIntegrationSettings(
      JSON.stringify({
        smtp: { host: 'mail.x', passEnc: 'CIFRADO-SMTP' },
        whatsapp: { authTokenEnc: 'CIFRADO-TWILIO', accountSid: 'AC1' },
      }),
    );

    it('nunca devolve segredos cifrados', () => {
      const json = JSON.stringify(publicIntegrationSettings(s));
      expect(json).not.toContain('CIFRADO');
      expect(json).not.toContain('passEnc');
      expect(json).not.toContain('authTokenEnc');
    });

    it('indica apenas se existem (hasPassword / hasAuthToken)', () => {
      const pub = publicIntegrationSettings(s);
      expect(pub.smtp.hasPassword).toBe(true);
      expect(pub.whatsapp.hasAuthToken).toBe(true);
      const empty = publicIntegrationSettings(parseIntegrationSettings(null));
      expect(empty.smtp.hasPassword).toBe(false);
      expect(empty.whatsapp.hasAuthToken).toBe(false);
    });
  });

  it('módulos da Ísis disponíveis', () => {
    expect([...ISIS_MODULE_OPTIONS]).toEqual([
      'LEARNING',
      'CAREER',
      'PDI',
      'PERFORMANCE',
      'ONBOARDING',
      'HR',
    ]);
  });
});
