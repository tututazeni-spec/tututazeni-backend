import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReadBulkDto } from './notifications.dto';

describe('ReadBulkDto', () => {
  it('ids válidos passam', async () => {
    const errors = await validate(plainToInstance(ReadBulkDto, { ids: [1, 2, 3] }));
    expect(errors).toHaveLength(0);
  });

  it('ids em falta falha', async () => {
    const errors = await validate(plainToInstance(ReadBulkDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('array com 101 elementos falha (ArrayMaxSize 100)', async () => {
    const errors = await validate(
      plainToInstance(ReadBulkDto, { ids: Array.from({ length: 101 }, (_, i) => i + 1) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('string dentro do array falha (IsInt each)', async () => {
    const errors = await validate(plainToInstance(ReadBulkDto, { ids: ['abc'] }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('id 0 falha (Min 1 each)', async () => {
    const errors = await validate(plainToInstance(ReadBulkDto, { ids: [0] }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
