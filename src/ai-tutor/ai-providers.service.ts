// src/ai-tutor/ai-providers.service.ts
//
// Suporte a 3 fornecedores gratuitos:
//   - Groq     → GRATUITO, rápido, Llama 3.3 70B / Mixtral  (console.groq.com)
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
    this.groqModel = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
    this.geminiApiKey = process.env.GEMINI_API_KEY ?? '';
    this.geminiModel = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
    this.ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL ?? 'llama3.2';

    this.logger.log(`🤖 Fornecedor de IA activo: ${this.provider.toUpperCase()}`);
  }

  async chat(systemPrompt: string, messages: ChatMessage[], maxTokens = 1024): Promise<AiResponse> {
    switch (this.provider) {
      case 'groq':
        return this.chatGroq(systemPrompt, messages, maxTokens);
      case 'gemini':
        return this.chatGemini(systemPrompt, messages, maxTokens);
      case 'ollama':
        return this.chatOllama(systemPrompt, messages, maxTokens);
      default:
        this.logger.warn(`Fornecedor desconhecido: ${this.provider}. A usar Groq.`);
        return this.chatGroq(systemPrompt, messages, maxTokens);
    }
  }

  getProviderInfo(): { provider: string; model: string; free: boolean; docs: string } {
    const info: Record<string, any> = {
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
  ): Promise<AiResponse> {
    if (!this.groqApiKey) {
      throw new InternalServerErrorException(
        'GROQ_API_KEY não configurada. Obtenha gratuitamente em https://console.groq.com',
      );
    }

    const body = {
      model: this.groqModel,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    };

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.groqApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Groq API error: ${err}`);
      throw new InternalServerErrorException(`Erro Groq: ${res.status}`);
    }

    const data: any = await res.json();
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      tokensUsed: data.usage?.completion_tokens ?? 0,
      provider: 'groq',
      model: this.groqModel,
    };
  }

  // ── GOOGLE GEMINI ─────────────────────────────────────────────────────────
  private async chatGemini(
    system: string,
    messages: ChatMessage[],
    maxTokens: number,
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
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Gemini API error: ${err}`);
      throw new InternalServerErrorException(`Erro Gemini: ${res.status}`);
    }

    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const tokensUsed = data.usageMetadata?.candidatesTokenCount ?? 0;

    return { text, tokensUsed, provider: 'gemini', model: this.geminiModel };
  }

  // ── OLLAMA (auto-hospedado) ────────────────────────────────────────────────
  private async chatOllama(
    system: string,
    messages: ChatMessage[],
    maxTokens: number,
  ): Promise<AiResponse> {
    const body = {
      model: this.ollamaModel,
      messages: [{ role: 'system', content: system }, ...messages],
      options: { num_predict: maxTokens },
      stream: false,
    };

    let res: Response;
    try {
      res = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new InternalServerErrorException(
        `Ollama não disponível em ${this.ollamaUrl}. Verifique se está a correr o servidor.`,
      );
    }

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Ollama error: ${err}`);
      throw new InternalServerErrorException(`Erro Ollama: ${res.status}`);
    }

    const data: any = await res.json();
    return {
      text: data.message?.content ?? '',
      tokensUsed: data.eval_count ?? 0,
      provider: 'ollama',
      model: this.ollamaModel,
    };
  }
}
