import { ZoomService } from './zoom.service';

describe('ZoomService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('isConfigured exige as 3 variáveis', () => {
    const z = new ZoomService();
    delete process.env.ZOOM_ACCOUNT_ID;
    expect(z.isConfigured()).toBe(false);
    process.env.ZOOM_ACCOUNT_ID = 'a';
    process.env.ZOOM_CLIENT_ID = 'b';
    process.env.ZOOM_CLIENT_SECRET = 'c';
    expect(z.isConfigured()).toBe(true);
  });

  it('obtém token e cria a reunião', async () => {
    process.env.ZOOM_ACCOUNT_ID = 'acc';
    process.env.ZOOM_CLIENT_ID = 'id';
    process.env.ZOOM_CLIENT_SECRET = 'sec';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 't', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456789,
          join_url: 'https://zoom.us/j/123456789',
          password: 'pw',
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const m = await new ZoomService().createMeeting({
      topic: 'Aula',
      startTime: new Date('2026-12-01T10:00:00Z'),
      durationMinutes: 60,
    });
    expect(m).toEqual({ id: '123456789', joinUrl: 'https://zoom.us/j/123456789', passcode: 'pw' });
    expect(fetchMock.mock.calls[0][0]).toContain('account_id=acc');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer t');
  });

  it('falha de autenticação vira 502', async () => {
    process.env.ZOOM_ACCOUNT_ID = 'a';
    process.env.ZOOM_CLIENT_ID = 'b';
    process.env.ZOOM_CLIENT_SECRET = 'c';
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'x',
      }) as unknown as typeof fetch;
    await expect(
      new ZoomService().createMeeting({ topic: 't', startTime: new Date(), durationMinutes: 30 }),
    ).rejects.toThrow('autenticar no Zoom');
  });
});
