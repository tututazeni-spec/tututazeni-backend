import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AiRole } from '@prisma/client';
import { AxiosResponse } from 'axios';

@Injectable()
export class AiTutorService {
  constructor(
    private prisma: PrismaService,
    private http: HttpService,
  ) {}

  async startSession(userId: number, courseId?: number, enrollmentId?: number) {
    return this.prisma.aiTutorSession.create({
      data: {
        userId,
        courseId,
        enrollmentId,
      },
    });
  }

  async sendMessage(sessionId: number, message: string) {
    const session = await this.prisma.aiTutorSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new BadRequestException('Sessão não encontrada');
    }

    await this.prisma.aiMessage.create({
      data: {
        sessionId,
        role: AiRole.USER,
        content: message,
      },
    });

    // 🔥 Integração com OpenAI (exemplo)
    type OpenAIResponse = {
  choices: {
    message: {
      content: string;
    };
  }[];
  usage?: {
    total_tokens: number;
  };
};

const response: AxiosResponse<OpenAIResponse> = await firstValueFrom(
  this.http.post<OpenAIResponse>(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: message }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    },
  ),
);

    const reply = response.data.choices[0].message.content;

    await this.prisma.aiMessage.create({
      data: {
        sessionId,
        role: AiRole.ASSISTANT,
        content: reply,
        tokensUsed: response.data.usage?.total_tokens,
      },
    });

    return reply;
  }

  async getSessionHistory(sessionId: number) {
    return this.prisma.aiMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }
}