import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ValidateApiKeyBodyDto } from './api-integration.dto';

describe('ValidateApiKeyBodyDto', () => {
  it('key válida passa', async () => {
    const errors = await validate(plainToInstance(ValidateApiKeyBodyDto, { key: 'sk-test-1234' }));
    expect(errors).toHaveLength(0);
  });

  it('key em falta falha', async () => {
    const errors = await validate(plainToInstance(ValidateApiKeyBodyDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('key acima de 512 chars falha', async () => {
    const errors = await validate(plainToInstance(ValidateApiKeyBodyDto, { key: 'a'.repeat(513) }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
