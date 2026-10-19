import { buildVerifyUrl } from './certificate-renderer';

/**
 * Ligação oficial "Add to profile" do LinkedIn (startTask=CERTIFICATION_NAME).
 * Não usa nenhuma API nem credenciais: abre o formulário do LinkedIn já preenchido.
 */
export function buildLinkedInUrl(c: {
  title: string;
  issuerName: string | null;
  issuedAt: Date;
  expiresAt: Date | null;
  validationCode: string;
}): string {
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.title,
    organizationName: c.issuerName || 'INNOVA',
    issueYear: String(c.issuedAt.getUTCFullYear()),
    issueMonth: String(c.issuedAt.getUTCMonth() + 1),
  });
  if (c.expiresAt) {
    params.set('expirationYear', String(c.expiresAt.getUTCFullYear()));
    params.set('expirationMonth', String(c.expiresAt.getUTCMonth() + 1));
  }
  params.set('certUrl', buildVerifyUrl(c.validationCode));
  params.set('certId', c.validationCode);
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
