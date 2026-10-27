import { createHash } from 'crypto';

// Lógica pura de faturação e métricas de negócio: sem BD, para ser testável.

export type Interval = 'MONTHLY' | 'YEARLY';

/** IVA em percentagem (omissão 14 %, taxa geral em Angola). BILLING_VAT_RATE sobrepõe. */
export function vatRate(): number {
  const n = Number(process.env.BILLING_VAT_RATE);
  return Number.isFinite(n) && n >= 0 ? n : 14;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTax(subtotal: number, ratePct: number) {
  const taxAmount = round2((subtotal * ratePct) / 100);
  return { subtotal: round2(subtotal), taxAmount, total: round2(subtotal + taxAmount) };
}

export function addInterval(from: Date, interval: Interval): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + (interval === 'YEARLY' ? 12 : 1));
  // 31 de Janeiro + 1 mês = fim de Fevereiro, não 3 de Março.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function monthlyEquivalent(price: number, interval: Interval): number {
  return interval === 'YEARLY' ? price / 12 : price;
}

export function invoiceSeries(date: Date): string {
  return `FT ${date.getUTCFullYear()}`;
}

/**
 * Hash encadeado SHA-256 (detecta alterações/remoções). NÃO é a assinatura RSA exigida pela AGT
 * a software de facturação: essa é feita pelo software certificado (ver FiscalProvider).
 */
export function invoiceHash(p: {
  issueDate: Date;
  createdAt: Date;
  fullNumber: string;
  total: number;
  previousHash: string | null;
}): string {
  const payload = [
    p.issueDate.toISOString().slice(0, 10),
    p.createdAt.toISOString().slice(0, 19),
    p.fullNumber,
    p.total.toFixed(2),
    p.previousHash ?? '',
  ].join(';');
  return createHash('sha256').update(payload).digest('hex');
}

export interface SubSnapshot {
  status: string;
  interval: Interval;
  price: number;
  createdAt: Date;
  canceledAt: Date | null;
  convertedAt: Date | null;
  hadTrial: boolean;
}

export interface BusinessMetrics {
  mrr: number;
  arr: number;
  payingCustomers: number;
  trialing: number;
  arpa: number;
  churnRatePct: number;
  ltv: number | null;
  cac: number | null;
  newCustomers: number;
  trialConversionPct: number | null;
  reliable: boolean;
  reliabilityNote: string | null;
}

/**
 * MRR = soma do equivalente mensal das subscrições pagas activas (ACTIVE + PAST_DUE).
 * Churn = cancelamentos/expirações na janela ÷ clientes pagos no início da janela.
 * LTV = ARPA ÷ churn mensal (indefinido sem churn). CAC = gasto de aquisição ÷ novos clientes pagos.
 */
export function computeMetrics(
  subs: SubSnapshot[],
  windowStart: Date,
  windowEnd: Date,
  acquisitionSpend: number,
): BusinessMetrics {
  const paying = subs.filter(s => ['ACTIVE', 'PAST_DUE'].includes(s.status));
  const mrr = round2(paying.reduce((a, s) => a + monthlyEquivalent(s.price, s.interval), 0));
  const inWin = (d: Date | null) => !!d && d >= windowStart && d <= windowEnd;

  const payingAtStart = subs.filter(
    s =>
      s.convertedAt &&
      s.convertedAt < windowStart &&
      (!s.canceledAt || s.canceledAt >= windowStart),
  ).length;
  const churned = subs.filter(s => s.convertedAt && inWin(s.canceledAt)).length;
  const newCustomers = subs.filter(s => inWin(s.convertedAt)).length;

  const days = Math.max(1, (windowEnd.getTime() - windowStart.getTime()) / 864e5);
  const churnRate = payingAtStart > 0 ? churned / payingAtStart : 0;
  const monthlyChurn = churnRate * (30 / days);
  const arpa = paying.length ? round2(mrr / paying.length) : 0;

  const trials = subs.filter(s => s.hadTrial && s.convertedAt !== undefined);
  const trialsEnded = trials.filter(s => s.status !== 'TRIALING');
  const converted = trialsEnded.filter(s => s.convertedAt).length;

  return {
    mrr,
    arr: round2(mrr * 12),
    payingCustomers: paying.length,
    trialing: subs.filter(s => s.status === 'TRIALING').length,
    arpa,
    churnRatePct: round2(churnRate * 100),
    ltv: monthlyChurn > 0 ? round2(arpa / monthlyChurn) : null,
    cac: newCustomers > 0 ? round2(acquisitionSpend / newCustomers) : null,
    newCustomers,
    trialConversionPct: trialsEnded.length ? round2((converted / trialsEnded.length) * 100) : null,
    ...reliability(Math.max(payingAtStart, paying.length)),
  };
}

/** Abaixo disto, churn/LTV/CAC/conversão são anedotas, não estatísticas: mostram-se com aviso. */
export const MIN_CUSTOMERS_FOR_RATES = 10;

function reliability(customers: number): { reliable: boolean; reliabilityNote: string | null } {
  return customers >= MIN_CUSTOMERS_FOR_RATES
    ? { reliable: true, reliabilityNote: null }
    : {
        reliable: false,
        reliabilityNote: `Amostra de ${customers} cliente(s) pago(s) (mínimo ${MIN_CUSTOMERS_FOR_RATES}): churn, LTV, CAC e conversão são indicativos. MRR, ARPA e cobrança são exactos.`,
      };
}

export interface InvoiceSnapshot {
  status: string;
  total: number;
  issueDate: Date;
  dueDate: Date;
  paidAt: Date | null;
}

export interface CollectionMetrics {
  invoicesDue: number;
  collectionRatePct: number | null;
  avgDaysToPay: number | null;
  overdueAmount: number;
  overdueRatePct: number | null;
}

/**
 * Saúde da cobrança — útil mesmo com um só cliente:
 * taxa de cobrança = faturas vencidas na janela que foram pagas ÷ vencidas na janela;
 * prazo médio = dias entre emissão e pagamento das pagas.
 */
export function computeCollections(
  invoices: InvoiceSnapshot[],
  windowStart: Date,
  windowEnd: Date,
): CollectionMetrics {
  const live = invoices.filter(i => i.status !== 'VOID');
  const due = live.filter(i => i.dueDate >= windowStart && i.dueDate <= windowEnd);
  const paid = due.filter(i => i.status === 'PAID');
  const dues = due.reduce((a, i) => a + i.total, 0);
  const overdue = live.filter(
    i => ['ISSUED', 'OVERDUE'].includes(i.status) && i.dueDate < windowEnd,
  );
  const overdueAmount = round2(overdue.reduce((a, i) => a + i.total, 0));
  const withPay = live.filter(i => i.status === 'PAID' && i.paidAt);
  return {
    invoicesDue: due.length,
    collectionRatePct: due.length ? round2((paid.length / due.length) * 100) : null,
    avgDaysToPay: withPay.length
      ? round2(
          withPay.reduce((a, i) => a + (i.paidAt!.getTime() - i.issueDate.getTime()) / 864e5, 0) /
            withPay.length,
        )
      : null,
    overdueAmount,
    overdueRatePct: dues > 0 ? round2((overdueAmount / dues) * 100) : null,
  };
}
