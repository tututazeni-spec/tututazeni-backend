import { PASSWORD_RESET_THROTTLE } from './auth.controller';

describe('PASSWORD_RESET_THROTTLE', () => {
  it('limita a 3 pedidos por hora', () => {
    expect(PASSWORD_RESET_THROTTLE.default.limit).toBe(3);
    expect(PASSWORD_RESET_THROTTLE.default.ttl).toBe(3_600_000);
  });
});
