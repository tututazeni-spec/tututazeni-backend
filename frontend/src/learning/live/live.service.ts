import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class LiveService {
  constructor(
    private prisma: PrismaService,
    private http: HttpService,
  ) {}

  async createZoomMeeting(courseId: number, topic: string, scheduledAt: Date) {
    const zoomResponse = await firstValueFrom(
      this.http.post(
        'https://api.zoom.us/v2/users/me/meetings',
        {
          topic,
          type: 2,
          start_time: scheduledAt,
          duration: 60,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.ZOOM_TOKEN}`,
          },
        },
      ),
    );

    return this.prisma.liveClass.create({
      data: {
        courseId,
        topic,
        scheduledAt,
        duration: 60,
        zoomMeetingId: zoomResponse.data.id.toString(),
      },
    });
  }

  async registerAttendance(liveClassId: number, userId: number) {
    return this.prisma.liveAttendance.create({
      data: {
        liveClassId,
        userId,
        joinedAt: new Date(),
      },
    });
  }

  async saveChatMessage(liveClassId: number, userId: number, message: string) {
    return this.prisma.liveChatMessage.create({
      data: {
        liveClassId,
        userId,
        message,
      },
    });
  }

  async submitEvaluation(evaluationId: number, userId: number, rating: number, feedback?: string) {
    return this.prisma.postClassResponse.create({
      data: {
        evaluationId,
        userId,
        rating,
        feedback,
      },
    });
  }
}