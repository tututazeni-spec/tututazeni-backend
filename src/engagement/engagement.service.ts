import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsInt, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitSurveyDto {
  @ApiProperty() @IsInt() surveyId!: number;
  @ApiProperty({ type: [Object] }) answers!: { questionId: number; value: number; comment?: string }[];
}

export class CreateSurveyDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
  @ApiProperty({ type: [Object] }) questions!: { text: string; type: string; order: number }[];
}

@Injectable()
export class EngagementService {
  constructor(private prisma: PrismaService) {}

  async getSurveys(active = true) {
    return this.prisma.engagementSurvey.findMany({
      where: active ? { status: 'ACTIVE' } : {},
      include: {
        _count: { select: { responses: true, questions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSurvey(id: number) {
    return this.prisma.engagementSurvey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
  }

  async createSurvey(dto: CreateSurveyDto) {
    const { questions, endDate, ...data } = dto;
    return this.prisma.engagementSurvey.create({
      data: {
        ...data,
        endDate: endDate ? new Date(endDate) : undefined,
        questions: { create: questions },
      },
      include: { questions: true },
    });
  }

  async submitSurvey(userId: number, dto: SubmitSurveyDto) {
    const existing = await this.prisma.surveyResponse.findFirst({
      where: { userId, surveyId: dto.surveyId },
    });
    if (existing) return { message: 'Já respondeste a este inquérito', alreadySubmitted: true };

    const response = await this.prisma.surveyResponse.create({
      data: {
        userId,
        surveyId: dto.surveyId,
        answers: {
          create: dto.answers.map(a => ({
            questionId: a.questionId,
            value: a.value,
            comment: a.comment,
          })),
        },
      },
    });

    const avg = dto.answers.length
      ? dto.answers.reduce((s, a) => s + a.value, 0) / dto.answers.length
      : 0;
    await this.prisma.surveyResponse.update({
      where: { id: response.id },
      data: { score: +avg.toFixed(2) },
    });

    return { message: 'Inquérito submetido com sucesso', responseId: response.id };
  }

  async getSurveyResults(surveyId: number) {
    const survey = await this.prisma.engagementSurvey.findUnique({
      where: { id: surveyId },
      include: {
        questions: true,
        responses: { include: { answers: true } },
      },
    });
    if (!survey) return null;

    const responses = survey.responses as any[];
    const totalResponses = responses.length;
    const avgScore = totalResponses
      ? responses.reduce((s, r) => s + (r.score ?? 0), 0) / totalResponses
      : 0;

    const questionStats = (survey.questions as any[]).map(q => {
      const answers = responses.flatMap(r => r.answers as any[]).filter(a => a.questionId === q.id);
      const avg = answers.length
        ? answers.reduce((s: number, a: any) => s + a.value, 0) / answers.length
        : 0;
      return { question: q.text, avgScore: +avg.toFixed(2), responses: answers.length };
    });

    return {
      survey: { id: survey.id, title: survey.title },
      totalResponses,
      avgScore: +avgScore.toFixed(2),
      questionStats,
    };
  }

  async getEngagementIndex() {
    const surveys = await this.prisma.engagementSurvey.findMany({
      where: { status: 'COMPLETED' },
      include: { responses: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // FIX TS7006: tipo explícito no parâmetro do .map()
    const history = surveys.map((s: typeof surveys[number]) => {
      const responses = s.responses as any[];
      const avg = responses.length
        ? responses.reduce((sum, r) => sum + (r.score ?? 0), 0) / responses.length
        : 0;
      return {
        surveyId: s.id,
        title: s.title,
        date: s.createdAt,
        avgScore: +avg.toFixed(2),
        responses: responses.length,
      };
    });

    const currentIndex = history[0]?.avgScore ?? 0;
    const trend = history.length > 1 ? currentIndex - (history[1]?.avgScore ?? 0) : 0;

    return { currentIndex, trend: +trend.toFixed(2), history };
  }
}