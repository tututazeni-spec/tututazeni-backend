// Documento imprimível da fatura (HTML): lógica pura, sem BD, para ser testável.
// Não é um documento fiscal enquanto a fatura não estiver CERTIFIED no software certificado AGT.

export interface InvoiceIssuer {
  name: string;
  nif: string;
  address: string;
  email?: string;
}

export interface InvoiceDocumentData {
  fullNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  customerName: string;
  customerNif: string | null;
  customerAddress: string | null;
  customerCountry: string | null;
  description: string;
  hash: string;
  fiscalStatus: string;
  fiscalRef: string | null;
}

/** Dados do emitente a partir do ambiente (BILLING_ISSUER_*). Campos em falta ficam vazios. */
export function issuerFromEnv(env: NodeJS.ProcessEnv = process.env): InvoiceIssuer {
  return {
    name: env.BILLING_ISSUER_NAME?.trim() ?? '',
    nif: env.BILLING_ISSUER_NIF?.trim() ?? '',
    address: env.BILLING_ISSUER_ADDRESS?.trim() ?? '',
    email: env.BILLING_ISSUER_EMAIL?.trim() || undefined,
  };
}

/** Campos do emitente que faltam (obrigatórios numa fatura). */
export function missingIssuerFields(issuer: InvoiceIssuer): string[] {
  const missing: string[] = [];
  if (!issuer.name) missing.push('BILLING_ISSUER_NAME');
  if (!issuer.nif) missing.push('BILLING_ISSUER_NIF');
  if (!issuer.address) missing.push('BILLING_ISSUER_ADDRESS');
  return missing;
}

/**
 * NIF angolano: 10 dígitos (pessoa colectiva, ex.: 5417012345) ou, para pessoa singular,
 * 9 dígitos + 2 letras + 3 dígitos (BI, ex.: 004123456LA041).
 * Valida só a forma; não consulta a AGT.
 */
export function isValidAngolaNif(nif: string | null | undefined): boolean {
  if (!nif) return false;
  const v = nif.replace(/\s+/g, '').toUpperCase();
  return /^\d{10}$/.test(v) || /^\d{9}[A-Z]{2}\d{3}$/.test(v);
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, c => ESC[c]);

const money = (n: number, currency: string) =>
  `${n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(currency)}`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Os 4 caracteres do hash que a AGT manda imprimir nos documentos (aqui, do hash interno). */
export function hashExcerpt(hash: string): string {
  return hash.slice(0, 4).toUpperCase();
}

export function renderInvoiceHtml(inv: InvoiceDocumentData, issuer: InvoiceIssuer): string {
  const certified = inv.fiscalStatus === 'CERTIFIED';
  const missing = missingIssuerFields(issuer);
  const banner = certified
    ? `Documento certificado no software de facturação validado. Referência fiscal: ${esc(inv.fiscalRef)}.`
    : 'DOCUMENTO INTERNO DE COBRANÇA — não constitui fatura para efeitos fiscais enquanto não for certificado no software de facturação validado pela AGT.';
  const warn = missing.length
    ? `<p class="warn">Dados do emitente incompletos (${esc(missing.join(', '))}).</p>`
    : '';
  const nifWarn =
    inv.customerNif && !isValidAngolaNif(inv.customerNif)
      ? '<p class="warn">NIF do cliente com formato inválido: corrigir antes de certificar.</p>'
      : '';
  const voided = inv.status === 'VOID' ? '<p class="warn">ANULADA</p>' : '';

  return `<!doctype html>
<html lang="pt"><head><meta charset="utf-8"><title>${esc(inv.fullNumber)}</title>
<style>
body{font-family:Arial,sans-serif;color:#111;max-width:760px;margin:24px auto;padding:0 16px;font-size:14px}
h1{font-size:20px;margin:0 0 4px}.cols{display:flex;gap:24px;justify-content:space-between}
.cols>div{flex:1}table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}td.n,th.n{text-align:right}
.banner{border:1.5px solid #0F1F3D;padding:8px;font-weight:bold}.warn{color:#b00020;font-weight:bold}
.foot{font-size:12px;color:#444;margin-top:16px}
</style></head><body>
<h1>Fatura ${esc(inv.fullNumber)}</h1>
<p class="banner">${banner}</p>${warn}${nifWarn}${voided}
<div class="cols">
<div><strong>Emitente</strong><br>${esc(issuer.name)}<br>NIF: ${esc(issuer.nif)}<br>${esc(issuer.address)}${issuer.email ? `<br>${esc(issuer.email)}` : ''}</div>
<div><strong>Cliente</strong><br>${esc(inv.customerName)}<br>NIF: ${esc(inv.customerNif) || 'Consumidor final'}<br>${esc(inv.customerAddress)}${inv.customerCountry ? `<br>${esc(inv.customerCountry)}` : ''}</div>
<div>Data de emissão: ${day(inv.issueDate)}<br>Vencimento: ${day(inv.dueDate)}<br>Período: ${day(inv.periodStart)} a ${day(inv.periodEnd)}</div>
</div>
<table><thead><tr><th>Descrição</th><th class="n">Valor líquido</th><th class="n">IVA ${inv.taxRate}%</th><th class="n">Total</th></tr></thead>
<tbody><tr><td>${esc(inv.description)}</td><td class="n">${money(inv.subtotal, inv.currency)}</td><td class="n">${money(inv.taxAmount, inv.currency)}</td><td class="n">${money(inv.total, inv.currency)}</td></tr></tbody></table>
<p><strong>Total a pagar: ${money(inv.total, inv.currency)}</strong></p>
<p class="foot">${hashExcerpt(inv.hash)} — ${certified ? 'Processado por programa validado' : 'Hash interno (não é a assinatura exigida pela AGT)'}</p>
</body></html>`;
}
