// src/events/events-attendance.scheduler.ts
// Fecho automático de presenças: de hora a hora, quem estava CONFIRMED num evento
// já terminado e nunca fez check-in fica NO_SHOW (ausente).
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventsService } from './events.service';

@Injectable()
export class EventsAttendanceScheduler {
  private readonly logger = new Logger(EventsAttendanceScheduler.name);

  constructor(private readonly events: EventsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async closeAttendance() {
    try {
      const n = await this.events.markNoShowsForEndedEvents();
      if (n > 0) {
        this.logger.log({ action: 'EVENT_NO_SHOW_CLOSE', count: n, msg: 'Ausências registadas' });
      }
    } catch (e) {
      this.logger.error({
        action: 'EVENT_NO_SHOW_CLOSE',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao fechar presenças de eventos terminados',
      });
    }
  }
}
