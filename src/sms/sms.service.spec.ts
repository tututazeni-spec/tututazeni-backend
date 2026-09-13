import { SmsService } from './sms.service';

describe('SmsService', () => {
  let service: SmsService;

  beforeEach(() => {
    service = new SmsService();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_SMS_FROM;
    delete process.env.TWILIO_WHATSAPP_FROM;
  });

  describe('sem Twilio configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN ausentes)', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('sendSms resolve sem lançar e regista warn', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await expect(service.sendSms('+244900000000', 'Olá')).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringContaining('Twilio não configurado') }),
      );
    });

    it('sendWhatsApp resolve sem lançar e regista warn', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await expect(service.sendWhatsApp('+244900000000', 'Olá')).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringContaining('Twilio não configurado') }),
      );
    });
  });

  describe('com TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN mas sem TWILIO_SMS_FROM/TWILIO_WHATSAPP_FROM', () => {
    beforeEach(() => {
      process.env.TWILIO_ACCOUNT_SID = 'ACxxxx';
      process.env.TWILIO_AUTH_TOKEN = 'tokxxxx';
      service.onModuleInit();
    });

    afterEach(() => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
    });

    it('sendSms resolve sem lançar e regista warn (TWILIO_SMS_FROM em falta)', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await expect(service.sendSms('+244900000000', 'Olá')).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringContaining('TWILIO_SMS_FROM') }),
      );
    });
  });

  describe('com Twilio totalmente configurado', () => {
    let createMock: jest.Mock;

    beforeEach(() => {
      process.env.TWILIO_ACCOUNT_SID = 'ACxxxx';
      process.env.TWILIO_AUTH_TOKEN = 'tokxxxx';
      process.env.TWILIO_SMS_FROM = '+244911111111';
      process.env.TWILIO_WHATSAPP_FROM = '+244922222222';
      service.onModuleInit();
      createMock = jest.fn().mockResolvedValue({ sid: 'SMxxxx' });
      (service as any).client = { messages: { create: createMock } };
    });

    afterEach(() => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_SMS_FROM;
      delete process.env.TWILIO_WHATSAPP_FROM;
    });

    it('sendSms chama Twilio com to/from/body correctos', async () => {
      await service.sendSms('+244900000000', 'Olá');
      expect(createMock).toHaveBeenCalledWith({
        to: '+244900000000',
        from: '+244911111111',
        body: 'Olá',
      });
    });

    it('sendSms lança se a Twilio rejeitar', async () => {
      createMock.mockRejectedValue(new Error('invalid number'));
      await expect(service.sendSms('+244900000000', 'Olá')).rejects.toThrow('invalid number');
    });

    it('sendWhatsApp prefixa to/from com "whatsapp:"', async () => {
      await service.sendWhatsApp('+244900000000', 'Olá');
      expect(createMock).toHaveBeenCalledWith({
        to: 'whatsapp:+244900000000',
        from: 'whatsapp:+244922222222',
        body: 'Olá',
      });
    });

    it('sendWhatsApp lança se a Twilio rejeitar', async () => {
      createMock.mockRejectedValue(new Error('not opted in'));
      await expect(service.sendWhatsApp('+244900000000', 'Olá')).rejects.toThrow('not opted in');
    });
  });
});
