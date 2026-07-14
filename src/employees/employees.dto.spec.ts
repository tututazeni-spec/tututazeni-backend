import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateContractStatusDto, UpdateCareerPlanStatusDto } from './employees.dto';

describe('UpdateContractStatusDto', () => {
  it('ACTIVE passa', async () => {
    const errors = await validate(plainToInstance(UpdateContractStatusDto, { status: 'ACTIVE' }));
    expect(errors).toHaveLength(0);
  });

  it('TERMINATED passa', async () => {
    const errors = await validate(
      plainToInstance(UpdateContractStatusDto, { status: 'TERMINATED' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('valor inválido falha', async () => {
    const errors = await validate(
      plainToInstance(UpdateContractStatusDto, { status: 'INVALID_STATUS' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('status em falta falha', async () => {
    const errors = await validate(plainToInstance(UpdateContractStatusDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateCareerPlanStatusDto', () => {
  it('ACTIVE passa', async () => {
    const errors = await validate(plainToInstance(UpdateCareerPlanStatusDto, { status: 'ACTIVE' }));
    expect(errors).toHaveLength(0);
  });

  it('COMPLETED passa', async () => {
    const errors = await validate(
      plainToInstance(UpdateCareerPlanStatusDto, { status: 'COMPLETED' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('valor fora da lista falha', async () => {
    const errors = await validate(plainToInstance(UpdateCareerPlanStatusDto, { status: 'BOGUS' }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
