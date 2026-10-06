import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { DeferredDelivery, NotificationsService } from '../../notifications/notifications.service';
import { CreateNotificationDto } from '../../notifications/notifications.dto';

@Processor('notifications')
export class NotificationsProcessor {
  constructor(private readonly notifications: NotificationsService) {}

  @Process('send')
  async handleSend(job: Job<CreateNotificationDto>): Promise<void> {
    await this.notifications.send(job.data);
  }

  // Email/WhatsApp adiados por estarem fora do horário permitido (Definições §5).
  @Process('deliver-external')
  async handleDeliverExternal(job: Job<DeferredDelivery>): Promise<void> {
    await this.notifications.deliverDeferred(job.data);
  }
}
