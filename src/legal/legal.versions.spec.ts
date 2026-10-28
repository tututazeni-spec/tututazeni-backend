import {
  isDraftVersion,
  LEGAL_VERSIONS,
  legalAcceptanceRequired,
  pendingDocuments,
} from './legal.versions';

describe('legal.versions', () => {
  it('sem aceitações, ambos os documentos estão pendentes', () => {
    expect(pendingDocuments([])).toEqual(['TERMS', 'PRIVACY']);
  });

  it('aceitar uma versão antiga não conta', () => {
    const accepted = [
      { docType: 'TERMS', version: '0.0' },
      { docType: 'PRIVACY', version: LEGAL_VERSIONS.PRIVACY },
    ];
    expect(pendingDocuments(accepted)).toEqual(['TERMS']);
  });

  it('aceitar as versões em vigor não deixa pendentes', () => {
    const accepted = [
      { docType: 'TERMS', version: LEGAL_VERSIONS.TERMS },
      { docType: 'PRIVACY', version: LEGAL_VERSIONS.PRIVACY },
    ];
    expect(pendingDocuments(accepted)).toEqual([]);
  });

  it('só obriga quando LEGAL_ACCEPTANCE_REQUIRED=true', () => {
    expect(legalAcceptanceRequired({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      legalAcceptanceRequired({
        LEGAL_ACCEPTANCE_REQUIRED: 'true',
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('versões 0.x são rascunho', () => {
    expect(isDraftVersion('0.1')).toBe(true);
    expect(isDraftVersion('1.0')).toBe(false);
  });
});
