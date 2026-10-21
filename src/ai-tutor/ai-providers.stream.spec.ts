import { AiProvidersService } from './ai-providers.service';

function sse(...payloads: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of payloads) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
}

describe('AiProvidersService — streaming Groq', () => {
  const fetchMock = jest.fn();
  let service: AiProvidersService;

  beforeEach(() => {
    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'k';
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new AiProvidersService();
  });

  it('entrega cada pedaço ao onToken, mesmo cortado a meio da linha, e junta o texto', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: sse(
        'data: {"choices":[{"delta":{"content":"Olá"}}]}\n\ndata: {"choices":[{"del',
        'ta":{"content":", tudo bem?"}}]}\n\n',
        'data: [DONE]\n\n',
      ),
    });
    const tokens: string[] = [];
    const res = await service.chat('sys', [{ role: 'user', content: 'oi' }], 100, 0.5, t =>
      tokens.push(t),
    );
    expect(tokens).toEqual(['Olá', ', tudo bem?']);
    expect(res.text).toBe('Olá, tudo bem?');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
  });

  it('sem onToken não pede streaming', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    });
    await service.chat('sys', [{ role: 'user', content: 'oi' }]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBeUndefined();
  });
});
