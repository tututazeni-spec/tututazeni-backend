import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  logNotification(data: any) {
    return this.prisma.notificationLog.create({ data });
  }

  findByUser(userId: number) {
    return this.prisma.notificationLog.findMany({
      where: { userId },
    });
  }
}
