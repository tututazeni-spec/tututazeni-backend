import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ParticipantStatus, ProgramStatus } from '@prisma/client';
import { CreateLeadershipProgramDto } from './leadership-program.dto';
import { LeadershipFilterDto, UpdateParticipantProgressDto } from './leadership.dto';

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

// A Task 2 introduziu a máquina de estados do programa (`LeadershipProgramsService`).
// Com o guard de transição a existir, os DTOs voltam a aceitar TODO o enum
// `ProgramStatus`/`ParticipantStatus` — é o serviço que rejeita transições
// ilegais, não o DTO. Este spec (antes: "só aceita o conjunto legado") passa a
// documentar que os novos valores do ciclo de vida são aceites ao nível do DTO.
describe('Leadership status DTOs — aceitam todo o ciclo de vida corporativo (pós-Task 2)', () => {
  it('os enums Prisma contêm os novos valores do ciclo de vida corporativo', () => {
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
    it.each([
      'DRAFT',
      'PLANNED',
      'OPEN_FOR_SELECTION',
      'SELECTION_CLOSED',
      'ACTIVE',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'ARCHIVED',
    ])('aceita o valor %s do ciclo de vida', async status => {
      const dto = await run(CreateLeadershipProgramDto, {
        code: 'LDR-DTO-T',
        name: 'Programa',
        level: 'INITIAL',
        status,
      });
      expect(dto.status).toBe(status);
    });

    it('rejeita um valor que não pertence ao enum (400)', async () => {
      await expect(
        run(CreateLeadershipProgramDto, {
          code: 'LDR-DTO-T',
          name: 'Programa',
          level: 'INITIAL',
          status: 'NOT_A_STATUS',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('LeadershipFilterDto.status', () => {
    it('aceita ARCHIVED', async () => {
      const dto = await run(LeadershipFilterDto, { status: 'ARCHIVED' });
      expect(dto.status).toBe('ARCHIVED');
    });

    it('aceita COMPLETED', async () => {
      const dto = await run(LeadershipFilterDto, { status: 'COMPLETED' });
      expect(dto.status).toBe('COMPLETED');
    });

    it('rejeita um valor fora do enum (400)', async () => {
      await expect(run(LeadershipFilterDto, { status: 'NOPE' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('UpdateParticipantProgressDto.status', () => {
    it.each([
      'ENROLLED',
      'IN_PROGRESS',
      'COMPLETED',
      'WITHDRAWN',
      'CANDIDATE',
      'INVITED',
      'SELECTED',
      'REJECTED',
      'FAILED',
      'CANCELLED',
    ])('aceita o valor %s do enum ParticipantStatus', async status => {
      const dto = await run(UpdateParticipantProgressDto, { progress: 50, status });
      expect(dto.status).toBe(status);
    });

    it('rejeita um valor fora do enum (400)', async () => {
      await expect(
        run(UpdateParticipantProgressDto, { progress: 50, status: 'BOGUS' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
