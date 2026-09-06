import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

/**
 * Payload de um job `webhooks:deliver`. O corpo (`body`) e a assinatura
 * (`signature`) são calculados uma única vez no momento do enqueue — assim
 * mantêm-se estáveis entre re-entregas (retry) do mesmo job.
 */
export interface WebhookDeliverJob {
  url: string;
  event: string;
  body: string;
  signature?: string;
  webhookId: number;
}

@Processor('webhooks')
export class WebhooksProcessor {
  private readonly logger = new Logger(WebhooksProcessor.name);

  @Process('deliver')
  async deliver(job: Job<WebhookDeliverJob>): Promise<void> {
    const { url, event, body, signature, webhookId } = job.data;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Innova-Event': event,
      // `job.id` é estável entre retries → o receptor pode deduplicar por aqui.
      'X-Innova-Delivery': String(job.id),
    };
    if (signature) headers['X-Innova-Signature'] = signature;

    const res = await fetch(url, {
      method: 'POST',
      body,
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Lançar → o Bull reagenda conforme `attempts`/`backoff` definidos no job.
      throw new Error(`webhook ${webhookId} → ${url} devolveu HTTP ${res.status}`);
    }

    this.logger.log({
      webhookId,
      url,
      event,
      statusCode: res.status,
      attempt: job.attemptsMade + 1,
      msg: 'Webhook entregue com sucesso',
    });
  }
}
