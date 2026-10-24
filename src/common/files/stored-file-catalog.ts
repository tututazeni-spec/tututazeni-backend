// src/common/files/stored-file-catalog.ts
// Colunas que guardam uma referência (`https://…`) a um ficheiro no storage e que entram pelo
// validador @IsAllowedFileUrl. É a lista que o job periódico (RemoteFileSweeper) e o script
// `npm run audit:uploads -- --remote` percorrem para verificar o que JÁ está registado.
// Ligações livres (YouTube, páginas externas em IsUrlOrInlineFile) não entram: nunca são descarregadas.
export interface StoredFileTarget {
  /** Nome do delegate Prisma (minúscula inicial). */
  model: string;
  field: string;
  /** Coluna com o MIME declarado, quando existe. */
  mimeField?: string;
}

const t = (model: string, field = 'fileUrl', mimeField?: string): StoredFileTarget => ({
  model,
  field,
  mimeField,
});

export const STORED_FILE_TARGETS: readonly StoredFileTarget[] = [
  t('document', 'fileUrl', 'mimeType'),
  t('docVersion', 'fileUrl', 'mimeType'),
  t('employeeDocument', 'fileUrl', 'mimeType'),
  t('libraryItem', 'fileUrl', 'mimeType'),
  t('leaveDocument', 'fileUrl', 'mimeType'),
  t('absenceAttachment', 'fileUrl', 'mimeType'),
  t('declarationAttachment', 'url', 'mimeType'),
  t('partnerDocument'),
  t('partnerAgreementVersion'),
  t('funderDocument'),
  t('funderOpportunityDocument'),
  t('funderReport'),
  t('beneficiaryDocument'),
  t('onboardingDocument'),
  t('trainingDocument'),
  t('assessmentAttemptAnswer'),
  t('internalAuditEvidence', 'url'),
  t('lessonResource', 'url'),
  t('moduleMaterial', 'url'),
  t('partner', 'logoUrl'),
  t('funder', 'logoUrl'),
  t('declarationTenantConfig', 'logoUrl'),
  t('declarationSignature', 'signatureUrl'),
];

/** Entidade de auditoria legível para um delegate Prisma (`docVersion` -> `DocVersion`). */
export const entityNameOf = (model: string): string =>
  model.charAt(0).toUpperCase() + model.slice(1);
