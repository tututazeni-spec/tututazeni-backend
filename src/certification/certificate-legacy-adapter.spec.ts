import {
  certificateToIssuedShape,
  issuedType,
  CertificateForLegacy,
} from './certificate-legacy-adapter';

const base = {
  id: 7,
  type: 'LEADERSHIP',
  userId: 10,
  enrollmentId: null,
  courseId: 42,
  programId: null,
  developmentPlanId: null,
  eventId: null,
  issuedAt: new Date('2026-03-01'),
  code: 'LEG-CERT-00001',
  validationCode: 'INNOVA-123-ABCD',
  fileUrl: 'https://x/f.pdf',
  expiresAt: null,
  revoked: false,
  hashCode: 'deadbeef',
  title: 'Programa de Liderança',
  recipientName: 'Ana Dias',
  issuerName: 'INNOVA',
  score: 88,
  pdfUrl: null,
  publicUrl: 'https://innova/verify/INNOVA-123-ABCD',
  linkedInUrl: null,
  revokedAt: null,
  revokeReason: null,
  revokedById: null,
  downloadCount: 2,
  verifyCount: 5,
  issuedById: 99,
  templateId: 'tmpl-1',
  metadata: '{"x":1}',
  deletedAt: null,
  legacyType: 'PROGRAM',
  legacyIssuedCertId: 'clx-legacy-1',
} as unknown as CertificateForLegacy;

describe('certificateToIssuedShape', () => {
  it('id<-legacyIssuedCertId, verificationCode<-validationCode, isRevoked<-revoked, code sem LEG-', () => {
    const out = certificateToIssuedShape(base);
    expect(out.id).toBe('clx-legacy-1');
    expect(out.verificationCode).toBe('INNOVA-123-ABCD');
    expect(out.code).toBe('CERT-00001');
    expect(out.isRevoked).toBe(false);
    expect(out.courseId).toBe('42'); // Int -> String
    expect(out.type).toBe('PROGRAM'); // legacyType autoritativo
    expect(out.pdfUrl).toBe('https://x/f.pdf'); // pdfUrl ?? fileUrl
  });

  it('legacyType ausente -> inverte de CertificateType (LEADERSHIP->PROGRAM)', () => {
    expect(issuedType({ legacyType: null, type: 'LEADERSHIP' } as never)).toBe('PROGRAM');
    expect(issuedType({ legacyType: null, type: 'TRAINING' } as never)).toBe('PARTICIPATION');
    expect(issuedType({ legacyType: 'ACHIEVEMENT', type: 'TRAINING' } as never)).toBe(
      'ACHIEVEMENT',
    );
  });

  it('legacyIssuedCertId ausente -> id = String(cert.id)', () => {
    const out = certificateToIssuedShape({
      ...base,
      legacyIssuedCertId: null,
    } as CertificateForLegacy);
    expect(out.id).toBe('7');
  });

  it('enrich injecta issuedBy/template; user vem da relação', () => {
    const out = certificateToIssuedShape(
      { ...base, user: { fullName: 'Ana Dias', email: 'a@x.com' } } as CertificateForLegacy,
      { issuedBy: { fullName: 'RH User' }, template: { name: 'T', html: '<p/>' } },
    );
    expect(out.user).toEqual({ fullName: 'Ana Dias', email: 'a@x.com' });
    expect(out.issuedBy).toEqual({ fullName: 'RH User' });
    expect(out.template).toEqual({ name: 'T', html: '<p/>' });
  });

  it('todas as chaves de IssuedShape presentes', () => {
    const out = certificateToIssuedShape({
      ...base,
      hashCode: null,
      title: null,
      code: null,
      pdfUrl: null,
      fileUrl: null,
      publicUrl: null,
      issuedById: null,
    } as CertificateForLegacy);
    for (const k of [
      'id',
      'code',
      'verificationCode',
      'hashCode',
      'userId',
      'templateId',
      'courseId',
      'programId',
      'title',
      'recipientName',
      'issuerName',
      'type',
      'score',
      'pdfUrl',
      'publicUrl',
      'linkedInUrl',
      'isRevoked',
      'revokedAt',
      'revokeReason',
      'revokedById',
      'issuedAt',
      'expiresAt',
      'downloadCount',
      'verifyCount',
      'metadata',
      'issuedById',
      'deletedAt',
      'createdAt',
      'updatedAt',
    ]) {
      expect(k in out).toBe(true);
    }
    expect(out.pdfUrl).toBeNull();
    expect(out.code).toBeNull();
  });
});
