import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PayoutDto } from './instructor.dto';

describe('PayoutDto', () => {
  it('amount válido passa', async () => {
    const errors = await validate(plainToInstance(PayoutDto, { amount: 150.5 }));
    expect(errors).toHaveLength(0);
  });

  it('amount zero falha (Min 0.01)', async () => {
    const errors = await validate(plainToInstance(PayoutDto, { amount: 0 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('amount negativo falha', async () => {
    const errors = await validate(plainToInstance(PayoutDto, { amount: -10 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('amount em falta falha', async () => {
    const errors = await validate(plainToInstance(PayoutDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('string em vez de número falha', async () => {
    const errors = await validate(plainToInstance(PayoutDto, { amount: 'cem' }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
