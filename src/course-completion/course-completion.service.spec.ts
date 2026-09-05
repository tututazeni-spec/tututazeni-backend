import { Test } from '@nestjs/testing';
import { CourseCompletionService } from './course-completion.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  enrollment: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  read: {
    courseModule: { findMany: jest.fn(), findUnique: jest.fn() },
    lesson: { count: jest.fn(), findUnique: jest.fn() },
    lessonProgress: { count: jest.fn() },
    quiz: { findFirst: jest.fn() },
    quizAttempt: { findFirst: jest.fn() },
  },
  lessonProgress: { upsert: jest.fn() },
  courseModule: { findUnique: jest.fn() },
  certificate: { findFirst: jest.fn(), create: jest.fn() },
  courseAnalytics: { updateMany: jest.fn() },
  userPoints: { upsert: jest.fn() },
  notificationLog: { create: jest.fn() },
};

describe('CourseCompletionService', () => {
  let service: CourseCompletionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CourseCompletionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(CourseCompletionService);
  });

  it('está definido', () => {
    expect(service).toBeDefined();
  });
});
