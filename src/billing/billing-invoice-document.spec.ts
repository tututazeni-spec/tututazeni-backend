import {
  InvoiceDocumentData,
  hashExcerpt,
  isValidAngolaNif,
  issuerFromEnv,
  missingIssuerFields,
  renderInvoiceHtml,
} from './billing-invoice-document';

const inv: InvoiceDocumentData = {
  fullNumber: 'FT 2026/1',
  status: 'ISSUED',
  issueDate: new Date('2026-10-01'),
  dueDate: new Date('2026-10-08'),
  periodStart: new Date('2026-10-01'),
  periodEnd: new Date('2026-10-31'),
  currency: 'AOA',
  subtotal: 100,
  taxRate: 14,
  taxAmount: 14,
  total: 114,
  customerName: 'Cliente <b>X</b>',
  customerNif: '5417012345',
  customerAddress: 'Luanda',
  customerCountry: 'AO',
  description: 'Subscrição',
  hash: 'abcdef',
  fiscalStatus: 'NOT_SUBMITTED',
  fiscalRef: null,
};

describe('billing-invoice-document', () => {
  it('valida a forma do NIF angolano', () => {
    expect(isValidAngolaNif('5417012345')).toBe(true);
    expect(isValidAngolaNif('004123456LA041')).toBe(true);
    expect(isValidAngolaNif('123')).toBe(false);
    expect(isValidAngolaNif(null)).toBe(false);
  });

  it('lista os campos do emitente em falta', () => {
    expect(missingIssuerFields(issuerFromEnv({}))).toEqual([
      'BILLING_ISSUER_NAME',
      'BILLING_ISSUER_NIF',
      'BILLING_ISSUER_ADDRESS',
    ]);
  });

  it('avisa que não é fiscal antes de certificar e escapa HTML', () => {
    const html = renderInvoiceHtml(inv, { name: 'EVOS', nif: '1', address: 'x' });
    expect(html).toContain('não constitui fatura para efeitos fiscais');
    expect(html).toContain('Cliente &lt;b&gt;X&lt;/b&gt;');
    expect(html).not.toContain('<b>X</b>');
    expect(hashExcerpt('abcdef')).toBe('ABCD');
  });

  it('mostra a referência fiscal quando certificada', () => {
    const html = renderInvoiceHtml(
      { ...inv, fiscalStatus: 'CERTIFIED', fiscalRef: 'REF-9' },
      { name: 'EVOS', nif: '1', address: 'x' },
    );
    expect(html).toContain('REF-9');
    expect(html).not.toContain('não constitui fatura');
  });
});
