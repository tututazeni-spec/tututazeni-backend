import {
  declarationToLegacyRequestShape,
  DeclarationForLegacy,
} from './declaration-legacy-adapter';

const base = {
  id: 'clx123',
  tenantId: 't1',
  code: 'LEG-REF-1',
  templateId: 7,
  requestedById: 10,
  assignedToId: null,
  employeeId: 10,
  type: 'CUSTOM',
  status: 'PENDING_SIGNATURE',
  locale: 'PT',
  layout: 'FORMAL',
  renderedContent: '<p>x</p>',
  pdfUrl: null,
  docxUrl: null,
  employeeSnapshot: { name: 'Ana', addressedTo: 'Banco X', extraVariables: { a: '1' } },
  title: 'Declaração',
  purpose: 'Bancária',
  showSalary: false,
  watermark: false,
  expiresAt: null,
  issuedAt: null,
  revokedAt: null,
  revokedReason: null,
  verificationHash: 'LEG-VER-1',
  qrCodeUrl: null,
  requestNotes: 'notas livres | Destinatário: Banco X',
  internalNotes: null,
  rejectedReason: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  legacyRequestId: 42,
  legacyStatus: 'PENDING',
  legacyPurposeId: 3,
  legacyGeneratedAt: null,
} as unknown as DeclarationForLegacy;

describe('declarationToLegacyRequestShape', () => {
  it('mapeia id<-legacyRequestId, referenceNumber<-code sem prefixo, status<-legacyStatus', () => {
    const out = declarationToLegacyRequestShape(base);
    expect(out.id).toBe(42);
    expect(out.userId).toBe(10);
    expect(out.referenceNumber).toBe('REF-1');
    expect(out.verificationCode).toBe('VER-1');
    expect(out.status).toBe('PENDING');
    expect(out.generatedContent).toBe('<p>x</p>');
    expect(out.purposeId).toBe(3);
    expect(out.purpose).toEqual({ id: 3, name: 'Bancária', category: null });
  });

  it('recupera addressedTo do snapshot e observations de requestNotes', () => {
    const out = declarationToLegacyRequestShape(base);
    expect(out.addressedTo).toBe('Banco X');
    expect(out.observations).toBe('notas livres');
    expect(out.extraVariables).toEqual({ a: '1' });
  });

  it('legacyStatus ausente -> deriva de DeclarationStatus (SIGNED->GENERATED)', () => {
    const out = declarationToLegacyRequestShape({
      ...base,
      legacyStatus: null,
      status: 'SIGNED',
    } as DeclarationForLegacy);
    expect(out.status).toBe('GENERATED');
  });

  it('legacyRequestId ausente -> id = null (Declaration nativa)', () => {
    const out = declarationToLegacyRequestShape({
      ...base,
      legacyRequestId: null,
    } as DeclarationForLegacy);
    expect(out.id).toBeNull();
  });

  it('status REJECTED -> approval sintetizado com approved:false e notes<-rejectedReason', () => {
    const out = declarationToLegacyRequestShape({
      ...base,
      legacyStatus: 'REJECTED',
      assignedToId: 5,
      rejectedReason: 'documentos em falta',
    } as DeclarationForLegacy);
    expect(out.approval).toMatchObject({
      approved: false,
      reviewerId: 5,
      notes: 'documentos em falta',
    });
  });

  it('status ISSUED com assignedToId -> approval approved:true', () => {
    const out = declarationToLegacyRequestShape({
      ...base,
      legacyStatus: 'ISSUED',
      assignedToId: 9,
      assignedTo: { id: 9, fullName: 'RH User', email: 'rh@x.com' },
    } as DeclarationForLegacy);
    expect(out.approval).toMatchObject({ approved: true, reviewerId: 9 });
    expect(out.approval?.reviewer).toEqual({ id: 9, fullName: 'RH User' });
  });

  it('todas as chaves legadas presentes mesmo sem equivalente', () => {
    const out = declarationToLegacyRequestShape({
      ...base,
      employeeSnapshot: {},
      requestNotes: null,
      verificationHash: null,
      legacyPurposeId: null,
      purpose: null,
    } as unknown as DeclarationForLegacy);
    for (const k of [
      'id',
      'userId',
      'templateId',
      'purposeId',
      'language',
      'addressedTo',
      'observations',
      'extraVariables',
      'status',
      'generatedContent',
      'referenceNumber',
      'verificationCode',
      'generatedAt',
      'issuedAt',
      'expiresAt',
    ]) {
      expect(k in out).toBe(true);
    }
    expect(out.verificationCode).toBeNull();
    expect(out.addressedTo).toBeNull();
    expect(out.purpose).toBeNull();
  });
});
