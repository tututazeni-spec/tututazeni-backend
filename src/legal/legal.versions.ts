// Versões em vigor dos documentos legais. Fonte única: o frontend lê-as de GET /legal/status.
//
// Regras:
//  - Mudou o texto de forma material → subir a versão aqui (e o texto em frontend/content/legal);
//    todos os utilizadores passam a ter de aceitar de novo.
//  - Versões "0.x" são RASCUNHOS para revisão jurídica. Enquanto LEGAL_ACCEPTANCE_REQUIRED não for
//    "true", a plataforma não obriga a aceitar nada. Só activar depois de o advogado aprovar o texto
//    e de a versão passar a "1.0".

export const LEGAL_DOC_TYPES = ['TERMS', 'PRIVACY'] as const;
export type LegalDocType = (typeof LEGAL_DOC_TYPES)[number];

export const LEGAL_VERSIONS: Record<LegalDocType, string> = {
  TERMS: '0.1',
  PRIVACY: '0.1',
};

export function isDraftVersion(version: string): boolean {
  return version.startsWith('0.');
}

export function legalAcceptanceRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LEGAL_ACCEPTANCE_REQUIRED === 'true';
}

/** Documentos de que o utilizador ainda não aceitou a versão em vigor. */
export function pendingDocuments(
  accepted: ReadonlyArray<{ docType: string; version: string }>,
): LegalDocType[] {
  return LEGAL_DOC_TYPES.filter(
    t => !accepted.some(a => a.docType === t && a.version === LEGAL_VERSIONS[t]),
  );
}
