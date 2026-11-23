import { getClientIp } from './client-ip';

const req = (o: { ip?: string; remote?: string; headers?: Record<string, string> }) =>
  ({ ip: o.ip, headers: o.headers ?? {}, socket: { remoteAddress: o.remote } }) as any;
const machine = () => '192.168.1.50';

describe('getClientIp', () => {
  it('usa o IP do cliente e tira o prefixo IPv6 mapeado', () => {
    expect(
      getClientIp(req({ ip: '::ffff:203.0.113.9', remote: '::ffff:203.0.113.9' }), machine),
    ).toBe('203.0.113.9');
  });

  it('atrás de proxy privado usa X-Forwarded-For / CF-Connecting-IP', () => {
    expect(
      getClientIp(
        req({
          ip: '10.0.0.2',
          remote: '10.0.0.2',
          headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.2' },
        }),
        machine,
      ),
    ).toBe('198.51.100.7');
    expect(
      getClientIp(
        req({ ip: '::1', remote: '::1', headers: { 'cf-connecting-ip': '198.51.100.8' } }),
        machine,
      ),
    ).toBe('198.51.100.8');
  });

  it('cliente externo directo não consegue forjar o IP por cabeçalho', () => {
    expect(
      getClientIp(
        req({
          ip: '203.0.113.9',
          remote: '203.0.113.9',
          headers: { 'x-forwarded-for': '1.1.1.1' },
        }),
        machine,
      ),
    ).toBe('203.0.113.9');
  });

  it('pedido da própria máquina devolve o IPv4 da máquina em vez de ::1', () => {
    expect(getClientIp(req({ ip: '::1', remote: '::1' }), machine)).toBe('192.168.1.50');
    expect(getClientIp(req({ ip: '127.0.0.1', remote: '::ffff:127.0.0.1' }), machine)).toBe(
      '192.168.1.50',
    );
  });

  it('sem rede local identificável mantém o loopback', () => {
    expect(getClientIp(req({ ip: '::1', remote: '::1' }), () => null)).toBe('::1');
  });
});
