import {
  addInterval,
  computeMetrics,
  computeTax,
  invoiceHash,
  invoiceSeries,
  monthlyEquivalent,
  SubSnapshot,
} from './billing.math';

describe('billing.math', () => {
  it('calcula IVA a 14 % com arredondamento a 2 casas', () => {
    expect(computeTax(100000, 14)).toEqual({ subtotal: 100000, taxAmount: 14000, total: 114000 });
    expect(computeTax(33.33, 14).total).toBe(38);
  });

  it('addInterval não salta de mês (31 Jan + 1 mês = 28/29 Fev)', () => {
    expect(addInterval(new Date('2027-01-31T00:00:00Z'), 'MONTHLY').toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
    expect(addInterval(new Date('2026-03-15T00:00:00Z'), 'YEARLY').toISOString()).toBe(
      '2027-03-15T00:00:00.000Z',
    );
  });

  it('série por ano e MRR anual normalizado', () => {
    expect(invoiceSeries(new Date('2026-10-27T00:00:00Z'))).toBe('FT 2026');
    expect(monthlyEquivalent(1200, 'YEARLY')).toBe(100);
  });

  it('hash depende do anterior (cadeia)', () => {
    const base = {
      issueDate: new Date('2026-10-27'),
      createdAt: new Date('2026-10-27T10:00:00Z'),
      fullNumber: 'FT 2026/1',
      total: 114000,
    };
    const h1 = invoiceHash({ ...base, previousHash: null });
    expect(h1).toHaveLength(64);
    expect(invoiceHash({ ...base, previousHash: h1 })).not.toBe(h1);
  });

  describe('computeMetrics', () => {
    const ws = new Date('2026-10-01');
    const we = new Date('2026-10-31');
    const mk = (o: Partial<SubSnapshot>): SubSnapshot => ({
      status: 'ACTIVE',
      interval: 'MONTHLY',
      price: 100,
      createdAt: new Date('2026-01-01'),
      canceledAt: null,
      convertedAt: new Date('2026-01-10'),
      hadTrial: true,
      ...o,
    });

    it('MRR, ARPA, churn, LTV e CAC', () => {
      const subs = [
        mk({}),
        mk({ interval: 'YEARLY', price: 1200 }),
        mk({ status: 'CANCELED', canceledAt: new Date('2026-10-10') }),
        mk({ convertedAt: new Date('2026-10-05') }),
      ];
      const m = computeMetrics(subs, ws, we, 300);
      expect(m.mrr).toBe(300);
      expect(m.payingCustomers).toBe(3);
      expect(m.arpa).toBe(100);
      expect(m.churnRatePct).toBe(33.33);
      expect(m.newCustomers).toBe(1);
      expect(m.cac).toBe(300);
      expect(m.ltv).not.toBeNull();
    });

    it('sem churn nem novos clientes: LTV e CAC indefinidos', () => {
      const m = computeMetrics([mk({})], ws, we, 0);
      expect(m.churnRatePct).toBe(0);
      expect(m.ltv).toBeNull();
      expect(m.cac).toBeNull();
    });
  });
});
