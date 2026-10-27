import { Injectable, Logger } from '@nestjs/common';
import { ApiIntegrationService } from './api-integration.service';
import { WebhookEventType } from './api-integration.dto';

/**
 * Ponto único para os módulos de negócio publicarem eventos para webhooks.
 * Fire-and-forget: nunca lança nem atrasa a operação de negócio. Os payloads
 * levam só identificadores (sem dados pessoais); o receptor consulta a API pública.
 */
@Injectable()
export class PlatformEventsService {
  private readonly logger = new Logger(PlatformEventsService.name);

  constructor(private readonly integrations: ApiIntegrationService) {}

  emit(event: WebhookEventType, payload: Record<string, unknown>): void {
    void this.integrations.emitPlatformEvent(event, payload).catch((err: unknown) =>
      this.logger.warn({
        event,
        action: 'PLATFORM_EVENT_EMIT',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao publicar evento para webhooks (não bloqueante)',
      }),
    );
  }
}
