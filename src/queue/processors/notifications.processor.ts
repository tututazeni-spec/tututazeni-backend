import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { NotificationsService } from '../../notifications/notifications.service';
import { CreateNotificationDto } from '../../notifications/notifications.dto';

@Processor('notifications')
export class NotificationsProcessor {
  constructor(private readonly notifications: NotificationsService) {}

  @Process('send')
  async handleSend(job: Job<CreateNotificationDto>): Promise<void> {
    await this.notifications.send(job.data);
  }
}
