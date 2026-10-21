// src/ai-tutor/isis-speech.service.ts
// Voz da Ísis via ElevenLabs. Devolve PCM16 mono a 16 kHz, o formato que o
// Simli exige, para o browser o enviar ao avatar sem conversões. A chave fica
// só no backend.
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IsisSpeechService {
  private readonly logger = new Logger(IsisSpeechService.name);

  constructor(private readonly config: ConfigService) {}

  async synthesizePcm16k(text: string): Promise<Buffer> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    const voiceId = this.config.get<string>('ELEVENLABS_VOICE_ID');
    if (!apiKey || !voiceId) {
      throw new ServiceUnavailableException('Voz da Ísis não configurada');
    }
    const modelId = this.config.get<string>('ELEVENLABS_MODEL_ID') || 'eleven_multilingual_v2';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_16000`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 },
        }),
      },
    );

    if (!response.ok) {
      this.logger.warn(`ElevenLabs respondeu ${response.status} ao gerar a voz da Ísis`);
      throw new ServiceUnavailableException('Falha ao gerar a voz da Ísis');
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
