import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { AiProvidersService } from './ai-providers.service';

const ENV_KEYS = [
  'AI_PROVIDER',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'OLLAMA_URL',
  'OLLAMA_MODEL',
] as const;

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
}
function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

async function buildService(): Promise<AiProvidersService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [AiProvidersService],
  }).compile();
  return module.get<AiProvidersService>(AiProvidersService);
}

describe('AiProvidersService', () => {
  const originalEnv = snapshotEnv();
  const originalFetch = global.fetch;

  afterEach(() => {
    restoreEnv(originalEnv);
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('chat — dispatch por fornecedor', () => {
    it('fornecedor desconhecido cai para Groq com aviso', async () => {
      process.env.AI_PROVIDER = 'unknown-provider';
      process.env.GROQ_API_KEY = 'gsk_test';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'oi' } }], usage: {} }),
      }) as any;

      const service = await buildService();
      const result = await service.chat('system', [{ role: 'user', content: 'oi' }]);
      expect(result.provider).toBe('groq');
    });
  });

  describe('Groq', () => {
    it('sem GROQ_API_KEY → InternalServerErrorException', async () => {
      process.env.AI_PROVIDER = 'groq';
      process.env.GROQ_API_KEY = '';
      const service = await buildService();
      await expect(service.chat('s', [])).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('falha de rede propaga o erro original', async () => {
      process.env.AI_PROVIDER = 'groq';
      process.env.GROQ_API_KEY = 'gsk_test';
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
      const service = await buildService();
      await expect(service.chat('s', [])).rejects.toThrow('ECONNREFUSED');
    });

    it('resposta não-ok (ex.: 429) → InternalServerErrorException com o status', async () => {
      process.env.AI_PROVIDER = 'groq';
      process.env.GROQ_API_KEY = 'gsk_test';
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      }) as any;
      const service = await buildService();
      await expect(service.chat('s', [])).rejects.toThrow('Erro Groq: 429');
    });

    it('resposta ok devolve texto e tokens usados', async () => {
      process.env.AI_PROVIDER = 'groq';
      process.env.GROQ_API_KEY = 'gsk_test';
      process.env.GROQ_MODEL = 'llama-teste';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Resposta Groq' } }],
          usage: { completion_tokens: 42 },
        }),
      }) as any;
      const service = await buildService();
      const result = await service.chat('s', [{ role: 'user', content: 'oi' }]);
      expect(result).toEqual({
        text: 'Resposta Groq',
        tokensUsed: 42,
        provider: 'groq',
        model: 'llama-teste',
      });
    });

    it('resposta com JSON inválido propaga o erro de parsing', async () => {
      process.env.AI_PROVIDER = 'groq';
      process.env.GROQ_API_KEY = 'gsk_test';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('unexpected token');
        },
      }) as any;
      const service = await buildService();
      await expect(service.chat('s', [])).rejects.toThrow('unexpected token');
    });
  });

  describe('Gemini', () => {
    it('sem GEMINI_API_KEY → InternalServerErrorException', async () => {
      process.env.AI_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = '';
      const service = await buildService();
      await expect(service.chat('s', [])).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('resposta não-ok → InternalServerErrorException com o status', async () => {
      process.env.AI_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'AIza_test';
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'server error',
      }) as any;
      const service = await buildService();
      await expect(service.chat('s', [])).rejects.toThrow('Erro Gemini: 500');
    });

    it('resposta ok devolve texto e tokens usados', async () => {
      process.env.AI_PROVIDER = 'gemini';
      process.env.GEMINI_API_KEY = 'AIza_test';
      process.env.GEMINI_MODEL = 'gemini-teste';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Resposta Gemini' }] } }],
          usageMetadata: { candidatesTokenCount: 7 },
        }),
      }) as any;
      const service = await buildService();
      const result = await service.chat('s', [{ role: 'user', content: 'oi' }]);
      expect(result).toEqual({
        text: 'Resposta Gemini',
        tokensUsed: 7,
        provider: 'gemini',
        model: 'gemini-teste',
      });
    });
  });

  describe('Ollama', () => {
    it('servidor indisponível → InternalServerErrorException com a URL', async () => {
      process.env.AI_PROVIDER = 'ollama';
      process.env.OLLAMA_URL = 'http://localhost:11434';
      global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as any;
      const service = await buildService();
      await expect(service.chat('s', [])).rejects.toThrow(/Ollama não disponível/);
    });

    it('resposta não-ok → InternalServerErrorException com o status', async () => {
      process.env.AI_PROVIDER = 'ollama';
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      }) as any;
      const service = await buildService();
      await expect(service.chat('s', [])).rejects.toThrow('Erro Ollama: 503');
    });

    it('resposta ok devolve texto e tokens usados', async () => {
      process.env.AI_PROVIDER = 'ollama';
      process.env.OLLAMA_MODEL = 'llama-local';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'Resposta Ollama' }, eval_count: 3 }),
      }) as any;
      const service = await buildService();
      const result = await service.chat('s', [{ role: 'user', content: 'oi' }]);
      expect(result).toEqual({
        text: 'Resposta Ollama',
        tokensUsed: 3,
        provider: 'ollama',
        model: 'llama-local',
      });
    });
  });

  describe('getProviderInfo', () => {
    it('devolve os dados do Gemini quando é o fornecedor activo', async () => {
      process.env.AI_PROVIDER = 'gemini';
      const service = await buildService();
      expect(service.getProviderInfo().provider).toBe('Gemini');
    });

    it('cai para Groq quando o fornecedor é desconhecido', async () => {
      process.env.AI_PROVIDER = 'desconhecido';
      const service = await buildService();
      expect(service.getProviderInfo().provider).toBe('Groq');
    });
  });
});
