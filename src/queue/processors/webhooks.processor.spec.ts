import { Job } from 'bull';
import { WebhooksProcessor, WebhookDeliverJob } from './webhooks.processor';

const makeJob = (
  data: WebhookDeliverJob,
  id: string | number = 'job-1',
  attemptsMade = 0,
): Job<WebhookDeliverJob> => ({ id, attemptsMade, data }) as unknown as Job<WebhookDeliverJob>;

describe('WebhooksProcessor', () => {
  let processor: WebhooksProcessor;

  beforeEach(() => {
    processor = new WebhooksProcessor();
    jest.restoreAllMocks();
  });

  it('faz POST ao url com corpo, evento e assinatura, e resolve em 2xx', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    await processor.deliver(
      makeJob({
        url: 'https://hook.test/in',
        event: 'user.created',
        body: '{"x":1}',
        signature: 'sha256=abc',
        webhookId: 3,
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hook.test/in',
      expect.objectContaining({
        method: 'POST',
        body: '{"x":1}',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Innova-Event': 'user.created',
          'X-Innova-Signature': 'sha256=abc',
          'X-Innova-Delivery': 'job-1',
        }),
      }),
    );
  });

  it('lança quando o endpoint devolve não-2xx (→ Bull reagenda conforme attempts/backoff)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(
      processor.deliver(
        makeJob({ url: 'https://hook.test/in', event: 'e', body: '{}', webhookId: 1 }),
      ),
    ).rejects.toThrow(/500/);
  });

  it('sem signature não envia o header X-Innova-Signature', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);

    await processor.deliver(
      makeJob({ url: 'https://hook.test/in', event: 'e', body: '{}', webhookId: 1 }),
    );

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Innova-Signature']).toBeUndefined();
  });
});
