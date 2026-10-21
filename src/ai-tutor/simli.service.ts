// src/ai-tutor/simli.service.ts
// Avatar em tempo real da Ísis (Simli). A chave de API fica só aqui, no
// backend: o browser recebe apenas um token temporário de sessão.
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSimliSessionToken } from 'simli-client';

export interface SimliSession {
  sessionToken: string;
  maxSessionLength: number;
  maxIdleTime: number;
}

@Injectable()
export class SimliService {
  private readonly logger = new Logger(SimliService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SIMLI_API_KEY') && this.config.get<string>('SIMLI_FACE_ID'),
    );
  }

  async createSession(): Promise<SimliSession> {
    const apiKey = this.config.get<string>('SIMLI_API_KEY');
    const faceId = this.config.get<string>('SIMLI_FACE_ID');
    if (!apiKey || !faceId) {
      throw new ServiceUnavailableException('Avatar da Ísis não configurado');
    }
    const maxSessionLength = this.config.get<number>('SIMLI_MAX_SESSION_SECONDS') ?? 600;
    const maxIdleTime = this.config.get<number>('SIMLI_MAX_IDLE_SECONDS') ?? 180;

    try {
      const { session_token } = await generateSimliSessionToken({
        apiKey,
        config: {
          faceId,
          // O áudio é enviado pelo browser via sendAudioData, não por microfone.
          handleSilence: true,
          maxSessionLength,
          maxIdleTime,
        },
      });
      return { sessionToken: session_token, maxSessionLength, maxIdleTime };
    } catch (err) {
      // O Simli lança o corpo da resposta como string; fica só no log.
      this.logger.error(`Simli token falhou: ${String(err).slice(0, 300)}`);
      throw new ServiceUnavailableException('Avatar da Ísis indisponível');
    }
  }
}
