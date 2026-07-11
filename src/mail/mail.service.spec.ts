import { MailService } from './mail.service';

describe('MailService', () => {
  it('sendPasswordReset regista a intenção sem lançar (entrega abstraída)', async () => {
    const service = new MailService();
    const spy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    await expect(
      service.sendPasswordReset('user@innova.com', 'tok123'),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it('não inclui o token em texto no argumento logado (evita vazamento no log)', async () => {
    const service = new MailService();
    const spy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    await service.sendPasswordReset('user@innova.com', 'segredo-do-token');
    const logged = spy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).not.toContain('segredo-do-token');
  });
});
