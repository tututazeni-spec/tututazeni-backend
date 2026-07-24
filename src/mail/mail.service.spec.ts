import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(() => {
    service = new MailService();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  describe('sem SMTP configurado (SMTP_HOST ausente)', () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it('sendPasswordReset resolve sem lançar e regista warn', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await expect(service.sendPasswordReset('user@innova.com', 'tok123')).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SMTP não configurado'));
    });

    it('sendUserInvite resolve sem lançar e regista warn', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await expect(
        service.sendUserInvite('novo@innova.com', 'João Silva', 'abc123def456'),
      ).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SMTP não configurado'));
    });

    it('token de reset nunca aparece nos logs', async () => {
      const spy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      await service.sendPasswordReset('user@innova.com', 'segredo-do-token');
      const logged = spy.mock.calls.map(c => String(c[0])).join(' ');
      expect(logged).not.toContain('segredo-do-token');
    });
  });

  describe('com SMTP configurado', () => {
    let sendMailMock: jest.Mock;

    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'test@test.com';
      process.env.SMTP_PASS = 'testpass';
      service.onModuleInit();
      sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
      (service as any).transporter = { sendMail: sendMailMock };
    });

    afterEach(() => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    });

    it('sendUserInvite envia para o email correcto com subject de boas-vindas', async () => {
      await service.sendUserInvite('novo@innova.com', 'João Silva', 'abc123def456');
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'novo@innova.com',
          subject: expect.stringContaining('Bem-vindo'),
        }),
      );
    });

    it('sendUserInvite inclui fullName e tempPassword no body', async () => {
      await service.sendUserInvite('novo@innova.com', 'João Silva', 'abc123def456');
      const { text } = sendMailMock.mock.calls[0][0] as { text: string };
      expect(text).toContain('João Silva');
      expect(text).toContain('abc123def456');
    });

    it('sendUserInvite lança se o transporter rejeitar', async () => {
      sendMailMock.mockRejectedValue(new Error('SMTP connection refused'));
      await expect(service.sendUserInvite('x@y.com', 'X', 'pass')).rejects.toThrow(
        'SMTP connection refused',
      );
    });

    it('sendPasswordReset lança se o transporter rejeitar', async () => {
      sendMailMock.mockRejectedValue(new Error('auth failed'));
      await expect(service.sendPasswordReset('x@y.com', 'token')).rejects.toThrow('auth failed');
    });
  });
});
