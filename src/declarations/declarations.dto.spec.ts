import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReasonDto } from './declarations.dto';

describe('ReasonDto (declarations)', () => {
  it('reason válido passa', async () => {
    const errors = await validate(plainToInstance(ReasonDto, { reason: 'Motivo' }));
    expect(errors).toHaveLength(0);
  });

  it('reason em falta falha', async () => {
    const errors = await validate(plainToInstance(ReasonDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reason acima de 1000 chars falha', async () => {
    const errors = await validate(plainToInstance(ReasonDto, { reason: 'a'.repeat(1001) }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
