import { Test, TestingModule } from '@nestjs/testing';
import { getToken } from '@willsoto/nestjs-prometheus';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from './prisma.service';

const mockPinoLogger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
};
const mockHistogram = { observe: jest.fn() };

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: PinoLogger, useValue: mockPinoLogger },
        { provide: getToken('prisma_query_duration_seconds'), useValue: mockHistogram },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
