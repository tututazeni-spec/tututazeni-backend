import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ParticipantStatus, ProgramStatus } from '@prisma/client';
import {
  CreateLeadershipProgramDto,
  LeadershipFilterDto,
  UpdateParticipantProgressDto,
} from './leadership.dto';

// Mesma configuração do ValidationPipe global de src/main.ts — validar com uma
// configuração mais fraca esconderia exactamente esta classe de bug.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const run = (metatype: any, value: Record<string, unknown>) =>
  pipe.transform(value, { type: 'body', metatype });

describe('Leadership status DTOs — só aceitam o conjunto legado (pré-Task 1)', () => {
  // Guarda de sanidade: os enums Prisma FORAM mesmo alargados. Sem isto, este
  // spec passaria trivialmente caso alguém revertesse a migração, e deixaria de
  // documentar que a restrição do DTO é deliberada e temporária.
  it('os enums Prisma já contêm os novos valores do ciclo de vida corporativo', () => {
    expect(Object.values(ProgramStatus)).toEqual(
      expect.arrayContaining([
        'PLANNED',
        'OPEN_FOR_SELECTION',
        'SELECTION_CLOSED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ]),
    );
    expect(Object.values(ParticipantStatus)).toEqual(
      expect.arrayContaining([
        'CANDIDATE',
        'INVITED',
        'SELECTED',
        'REJECTED',
        'FAILED',
        'CANCELLED',
      ]),
    );
  });

  describe('CreateLeadershipProgramDto.status', () => {
    it.each(['DRAFT', 'ACTIVE', 'ARCHIVED'])('aceita o valor legado %s', async status => {
      const dto = await run(CreateLeadershipProgramDto, {
        name: 'Programa',
        level: 'INITIAL',
        status,
      });
      expect(dto.status).toBe(status);
    });

    it.each([
      'PLANNED',
      'OPEN_FOR_SELECTION',
      'SELECTION_CLOSED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ])('rejeita o novo valor %s enquanto não existir máquina de estados (400)', async status => {
      await expect(
        run(CreateLeadershipProgramDto, { name: 'Programa', level: 'INITIAL', status }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('LeadershipFilterDto.status', () => {
    it('aceita ARCHIVED', async () => {
      const dto = await run(LeadershipFilterDto, { status: 'ARCHIVED' });
      expect(dto.status).toBe('ARCHIVED');
    });

    it('rejeita COMPLETED (400)', async () => {
      await expect(run(LeadershipFilterDto, { status: 'COMPLETED' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('UpdateParticipantProgressDto.status', () => {
    it.each(['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN'])(
      'aceita o valor legado %s',
      async status => {
        const dto = await run(UpdateParticipantProgressDto, { progress: 50, status });
        expect(dto.status).toBe(status);
      },
    );

    it.each(['CANDIDATE', 'INVITED', 'SELECTED', 'REJECTED', 'FAILED', 'CANCELLED'])(
      'rejeita o novo valor %s enquanto não existir máquina de estados (400)',
      async status => {
        await expect(
          run(UpdateParticipantProgressDto, { progress: 50, status }),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );
  });
});
