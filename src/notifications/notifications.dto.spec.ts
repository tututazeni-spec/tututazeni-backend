import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ReadBulkDto,
  SendAllNotificationDto,
  CreateAutomationRuleBodyDto,
} from './notifications.dto';

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

describe('SendAllNotificationDto', () => {
  it('campos válidos passam', async () => {
    const errors = await validate(
      plainToInstance(SendAllNotificationDto, { type: 'INFO', message: 'Olá' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('message em falta falha', async () => {
    const errors = await validate(plainToInstance(SendAllNotificationDto, { type: 'INFO' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('message acima de 2000 chars falha', async () => {
    const errors = await validate(
      plainToInstance(SendAllNotificationDto, { type: 'INFO', message: 'a'.repeat(2001) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('CreateAutomationRuleBodyDto', () => {
  it('campos válidos passam', async () => {
    const errors = await validate(
      plainToInstance(CreateAutomationRuleBodyDto, {
        name: 'Regra',
        trigger: 'LOGIN',
        action: 'NOTIFY',
        condition: 'always',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('name em falta falha', async () => {
    const errors = await validate(
      plainToInstance(CreateAutomationRuleBodyDto, {
        trigger: 'LOGIN',
        action: 'NOTIFY',
        condition: 'always',
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
