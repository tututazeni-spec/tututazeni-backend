import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Complete1on1Dto } from './leader.dto';

describe('Complete1on1Dto', () => {
  it('notes válidas passam', async () => {
    const errors = await validate(
      plainToInstance(Complete1on1Dto, { notes: 'Reunião correu bem.' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('notes em falta falha', async () => {
    const errors = await validate(plainToInstance(Complete1on1Dto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('notes acima de 5000 chars falha', async () => {
    const errors = await validate(plainToInstance(Complete1on1Dto, { notes: 'a'.repeat(5001) }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
