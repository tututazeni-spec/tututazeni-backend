import { logQueryEvent } from './query-logging';

function makeLogger() {
  return { warn: jest.fn(), debug: jest.fn() };
}

describe('logQueryEvent', () => {
  const event = { query: 'SELECT 1', params: '[]', duration: 0, target: 'User.findMany' };

  it('query lenta (>= limiar): loga warn com durationMs e query', () => {
    const logger = makeLogger();
    logQueryEvent(logger as any, { ...event, duration: 800 }, 500);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 800, query: 'SELECT 1' }),
      'slow query',
    );
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('query rápida (< limiar): loga debug, sem warn', () => {
    const logger = makeLogger();
    logQueryEvent(logger as any, { ...event, duration: 10 }, 500);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 10, query: 'SELECT 1', target: 'User.findMany' }),
      'db query',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
