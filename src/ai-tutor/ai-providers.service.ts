// src/ai-tutor/ai-providers.service.ts
//
// Suporte a 3 fornecedores gratuitos:
//   - Groq     → GRATUITO, rápido, GPT-OSS 120B / Qwen3 (console.groq.com)
//   - Gemini   → GRATUITO, Google, gemini-1.5-flash          (aistudio.google.com)
//   - Ollama   → GRATUITO, auto-hospedado, corre no servidor  (ollama.com)
//
// Configurar em .env:
//   AI_PROVIDER=groq         ← escolher: groq | gemini | ollama
//   GROQ_API_KEY=gsk_...
//   GEMINI_API_KEY=AIza...
//   OLLAMA_URL=http://localhost:11434
//
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiResponse {
  text: string;
  tokensUsed?: number;
  provider: string;
  model: string;
}

interface ProviderInfo {
  provider: string;
  model: string;
  free: boolean;
  docs: string;
}

// Formas das respostas JSON de cada fornecedor — só os campos consumidos
// abaixo, o resto da resposta real é ignorado.
interface GroqStreamChunk {
  choices?: { delta?: { content?: string } }[];
}

interface GroqChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { completion_tokens?: number };
}

interface GeminiChatResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { candidatesTokenCount?: number };
}

interface OllamaChatResponse {
  message?: { content?: string };
  eval_count?: number;
}

@Injectable()
export class AiProvidersService {
  private readonly logger = new Logger(AiProvidersService.name);
  private readonly provider: string;

  private readonly groqApiKey: string;
  private readonly groqModel: string;

  private readonly geminiApiKey: string;
  private readonly geminiModel: string;

  private readonly ollamaUrl: string;
  private readonly ollamaModel: string;

  constructor() {
    this.provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
    this.groqApiKey = process.env.GROQ_API_KEY ?? '';
    this.groqModel = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
    this.geminiApiKey = process.env.GEMINI_API_KEY ?? '';
    this.geminiModel = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
    this.ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL ?? 'llama3.2';

    this.logger.log(`🤖 Fornecedor de IA activo: ${this.provider.toUpperCase()}`);
  }

  async chat(
    systemPrompt: string,
    messages: ChatMessage[],
    maxTokens = 1024,
    temperature = 0.7,
    onToken?: (delta: string) => void,
    // Só Groq: modelo alternativo (quota própria na Groq) para tarefas auxiliares.
    modelOverride?: string,
  ): Promise<AiResponse> {
    switch (this.provider) {
      case 'groq':
        return this.chatGroq(
          systemPrompt,
          messages,
          maxTokens,
          temperature,
          onToken,
          modelOverride,
        );
      case 'gemini':
        return this.emitWhole(
          await this.chatGemini(systemPrompt, messages, maxTokens, temperature),
          onToken,
        );
      case 'ollama':
        return this.emitWhole(
          await this.chatOllama(systemPrompt, messages, maxTokens, temperature),
          onToken,
        );
      default:
        this.logger.warn(`Fornecedor desconhecido: ${this.provider}. A usar Groq.`);
        return this.chatGroq(systemPrompt, messages, maxTokens, temperature, onToken);
    }
  }

  // Fornecedores sem streaming: a resposta inteira sai de uma vez no onToken.
  private emitWhole(res: AiResponse, onToken?: (delta: string) => void): AiResponse {
    if (onToken && res.text) onToken(res.text);
    return res;
  }

  getProviderInfo(): { provider: string; model: string; free: boolean; docs: string } {
    const info: Record<string, ProviderInfo> = {
      groq: {
        provider: 'Groq',
        model: this.groqModel,
        free: true,
        docs: 'https://console.groq.com',
      },
      gemini: {
        provider: 'Gemini',
        model: this.geminiModel,
        free: true,
        docs: 'https://aistudio.google.com',
      },
      ollama: {
        provider: 'Ollama',
        model: this.ollamaModel,
        free: true,
        docs: 'https://ollama.com',
      },
    };
    return info[this.provider] ?? info['groq'];
  }

  // ── GROQ (OpenAI-compatible API) ─────────────────────────────────────────
  private async chatGroq(
    system: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
    onToken?: (delta: string) => void,
    modelOverride?: string,
  ): Promise<AiResponse> {
    const model = modelOverride ?? this.groqModel;
    if (!this.groqApiKey) {
      throw new InternalServerErrorException(
        'GROQ_API_KEY não configurada. Obtenha gratuitamente em https://console.groq.com',
      );
    }

    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'system', content: system }, ...messages],
      // Os modelos gpt-oss "pensam" antes de responder; no tutor por voz isso
      // só atrasa a resposta, por isso o esforço de raciocínio fica baixo.
      ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
      ...(onToken ? { stream: true } : {}),
    };

    const send = () =>
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.groqApiKey}`,
        },
        body: JSON.stringify(body),
      });

    let res: Response;
    try {
      res = await send();
      // 429 (limite por minuto): espera o que a Groq indicar (até 5s) e tenta uma vez.
      if (res.status === 429) {
        const wait = Math.min(Number(res.headers?.get?.('retry-after')) || 2, 5);
        await new Promise(r => setTimeout(r, wait * 1000));
        res = await send();
      }
    } catch (err: unknown) {
      this.logger.error({
        provider: 'groq',
        operation: 'chat',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha de rede ao chamar Groq API',
      });
      throw err;
    }

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Groq API error: ${err}`);
      throw new InternalServerErrorException(`Erro Groq: ${res.status}`);
    }

    if (onToken) return this.readGroqStream(res, onToken);

    try {
      const data = (await res.json()) as GroqChatResponse;
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        tokensUsed: data.usage?.completion_tokens ?? 0,
        provider: 'groq',
        model,
      };
    } catch (err: unknown) {
      this.logger.error({
        provider: 'groq',
        operation: 'chat',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao interpretar resposta da Groq API',
      });
      throw err;
    }
  }

  // Lê a resposta em streaming (SSE "data: {...}") e entrega cada pedaço de
  // texto ao onToken à medida que chega.
  private async readGroqStream(
    res: Response,
    onToken: (delta: string) => void,
  ): Promise<AiResponse> {
    if (!res.body) throw new InternalServerErrorException('Groq não devolveu stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const delta = (JSON.parse(payload) as GroqStreamChunk).choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            onToken(delta);
          }
        } catch {
          // linha parcial/ruído: ignora, o resto do stream continua
        }
      }
    }
    return { text, tokensUsed: 0, provider: 'groq', model: this.groqModel };
  }

  // ── GOOGLE GEMINI ─────────────────────────────────────────────────────────
  private async chatGemini(
    system: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<AiResponse> {
    if (!this.geminiApiKey) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY não configurada. Obtenha gratuitamente em https://aistudio.google.com',
      );
    }

    const contents = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      this.logger.error({
        provider: 'gemini',
        operation: 'chat',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha de rede ao chamar Gemini API',
      });
      throw err;
    }

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Gemini API error: ${err}`);
      throw new InternalServerErrorException(`Erro Gemini: ${res.status}`);
    }

    try {
      const data = (await res.json()) as GeminiChatResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const tokensUsed = data.usageMetadata?.candidatesTokenCount ?? 0;

      return { text, tokensUsed, provider: 'gemini', model: this.geminiModel };
    } catch (err: unknown) {
      this.logger.error({
        provider: 'gemini',
        operation: 'chat',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao interpretar resposta da Gemini API',
      });
      throw err;
    }
  }

  // ── OLLAMA (auto-hospedado) ────────────────────────────────────────────────
  private async chatOllama(
    system: string,
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<AiResponse> {
    const body = {
      model: this.ollamaModel,
      messages: [{ role: 'system', content: system }, ...messages],
      options: { num_predict: maxTokens, temperature },
      stream: false,
    };

    let res: Response;
    try {
      res = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      this.logger.error({
        provider: 'ollama',
        operation: 'chat',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha de rede ao chamar Ollama',
      });
      throw new InternalServerErrorException(
        `Ollama não disponível em ${this.ollamaUrl}. Verifique se está a correr o servidor.`,
      );
    }

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Ollama error: ${err}`);
      throw new InternalServerErrorException(`Erro Ollama: ${res.status}`);
    }

    try {
      const data = (await res.json()) as OllamaChatResponse;
      return {
        text: data.message?.content ?? '',
        tokensUsed: data.eval_count ?? 0,
        provider: 'ollama',
        model: this.ollamaModel,
      };
    } catch (err: unknown) {
      this.logger.error({
        provider: 'ollama',
        operation: 'chat',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao interpretar resposta do Ollama',
      });
      throw err;
    }
  }
}
