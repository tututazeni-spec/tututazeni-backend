import { Process, Processor } from '@nestjs/bull';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';

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

  // Optional: specs sem PrismaService continuam a montar o processor.
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /** Regista a tentativa em WebhookDelivery (uma linha por job, estável entre retries). */
  private async recordDelivery(
    job: Job<WebhookDeliverJob>,
    status: 'DELIVERED' | 'FAILED' | 'PENDING',
    responseCode?: number,
  ): Promise<void> {
    if (!this.prisma) return;
    const attempts = job.attemptsMade + 1;
    const id = `wh-${job.id}`;
    await this.prisma.webhookDelivery
      .upsert({
        where: { id },
        create: {
          id,
          webhookId: job.data.webhookId,
          event: job.data.event,
          payload: job.data.body,
          status,
          attempt: attempts,
          attempts,
          responseCode,
          deliveredAt: status === 'DELIVERED' ? new Date() : undefined,
        },
        update: {
          status,
          attempt: attempts,
          attempts,
          responseCode,
          deliveredAt: status === 'DELIVERED' ? new Date() : undefined,
        },
      })
      .catch((err: unknown) =>
        this.logger.warn({
          webhookId: job.data.webhookId,
          err: { message: err instanceof Error ? err.message : String(err) },
          msg: 'Falha ao registar WebhookDelivery',
        }),
      );
  }

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

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        body,
        headers,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      await this.recordDelivery(job, 'FAILED');
      throw err;
    }
    await this.recordDelivery(job, res.ok ? 'DELIVERED' : 'FAILED', res.status);

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
