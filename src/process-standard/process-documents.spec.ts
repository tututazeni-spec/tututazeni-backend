import {
  confidentialityFromSensitivity,
  effectiveStatus,
  evaluateRequirements,
  expiryInfo,
  matchesRequired,
  maxConfidentiality,
  nextDocVersion,
  renderTemplate,
  retentionDate,
} from './process-documents';

const NOW = new Date('2026-10-05T10:00:00Z');
const doc = (over: Partial<Parameters<typeof evaluateRequirements>[1][number]>) => ({
  id: 1,
  name: 'Contrato',
  docType: 'CONTRATO',
  validationStatus: 'APPROVED',
  validUntil: null as Date | null,
  archivedAt: null as Date | null,
  ...over,
});

describe('effectiveStatus / expiryInfo', () => {
  it('um aprovado fora da validade fica EXPIRED', () => {
    expect(
      effectiveStatus({ validationStatus: 'APPROVED', validUntil: new Date('2026-10-01') }, NOW),
    ).toBe('EXPIRED');
    expect(
      effectiveStatus({ validationStatus: 'PENDING', validUntil: new Date('2026-10-01') }, NOW),
    ).toBe('PENDING');
  });

  it('calcula dias restantes e a janela de 30 dias', () => {
    expect(expiryInfo(new Date('2026-10-20T10:00:00Z'), NOW)).toMatchObject({
      expired: false,
      expiringSoon: true,
      daysLeft: 15,
    });
    expect(expiryInfo(new Date('2026-12-31T10:00:00Z'), NOW).expiringSoon).toBe(false);
    expect(expiryInfo(new Date('2026-10-01T10:00:00Z'), NOW).expired).toBe(true);
    expect(expiryInfo(null, NOW)).toEqual({ expired: false, expiringSoon: false, daysLeft: null });
  });
});

describe('evaluateRequirements', () => {
  it('casa por tipo ou nome, sem acentos nem maiúsculas', () => {
    const r = evaluateRequirements(
      ['contrato', 'Declaração'],
      [doc({}), doc({ id: 2, name: 'DECLARACAO', docType: 'X' })],
      NOW,
    );
    expect(r).toEqual([
      { name: 'contrato', state: 'OK', documentId: 1 },
      { name: 'Declaração', state: 'OK', documentId: 2 },
    ]);
  });

  it('classifica em falta, pedido, pendente, rejeitado e expirado', () => {
    const docs = [
      doc({ id: 1, docType: 'A', name: 'a', validationStatus: 'REQUESTED' }),
      doc({ id: 2, docType: 'B', name: 'b', validationStatus: 'PENDING' }),
      doc({ id: 3, docType: 'C', name: 'c', validationStatus: 'REJECTED' }),
      doc({ id: 4, docType: 'D', name: 'd', validUntil: new Date('2026-01-01') }),
    ];
    const states = evaluateRequirements(['A', 'B', 'C', 'D', 'E'], docs, NOW).map(r => r.state);
    expect(states).toEqual(['REQUESTED', 'PENDING', 'REJECTED', 'EXPIRED', 'MISSING']);
  });

  it('fica com o melhor estado e ignora arquivados', () => {
    const docs = [
      doc({ id: 1, validationStatus: 'REJECTED' }),
      doc({ id: 2, validationStatus: 'APPROVED' }),
      doc({ id: 3, validationStatus: 'APPROVED', archivedAt: new Date() }),
    ];
    expect(evaluateRequirements(['CONTRATO'], docs, NOW)[0]).toMatchObject({
      state: 'OK',
      documentId: 2,
    });
    expect(evaluateRequirements(['CONTRATO'], [docs[2]], NOW)[0].state).toBe('MISSING');
  });
});

describe('regras auxiliares', () => {
  it('matchesRequired compara nome e tipo normalizados', () => {
    expect(matchesRequired(['Cópia do BI'], 'copia do bi', 'X')).toBe(true);
    expect(matchesRequired(['Cópia do BI'], 'Outro', 'Outro')).toBe(false);
  });

  it('nextDocVersion incrementa a parte principal', () => {
    expect(nextDocVersion('1.0')).toBe('2.0');
    expect(nextDocVersion('3.4')).toBe('4.0');
    expect(nextDocVersion('x')).toBe('1.0');
  });

  it('retentionDate respeita o prazo existente se for mais longo', () => {
    const from = new Date('2026-10-05T00:00:00Z');
    expect(retentionDate(null, from).toISOString().slice(0, 10)).toBe('2031-10-05');
    expect(retentionDate(new Date('2040-01-01'), from).toISOString().slice(0, 10)).toBe(
      '2040-01-01',
    );
    expect(retentionDate(new Date('2027-01-01'), from).toISOString().slice(0, 10)).toBe(
      '2031-10-05',
    );
  });

  it('mapeia sensibilidade e nunca baixa a confidencialidade', () => {
    expect(confidentialityFromSensitivity('SECRET')).toBe('RESTRICTED');
    expect(confidentialityFromSensitivity(undefined)).toBe('INTERNAL');
    expect(maxConfidentiality('PUBLIC', 'CONFIDENTIAL')).toBe('CONFIDENTIAL');
    expect(maxConfidentiality('RESTRICTED', 'INTERNAL')).toBe('RESTRICTED');
  });
});

describe('renderTemplate', () => {
  it('substitui variáveis, limpa HTML e lista as não resolvidas', () => {
    const { text, unresolved } = renderTemplate(
      '<p>Olá {{ nome }}, processo {{codigo}} — {{falta}}</p>',
      {
        nome: 'Ana',
        codigo: 'PROC-1',
      },
    );
    expect(text).toBe('Olá Ana, processo PROC-1 — [falta]');
    expect(unresolved).toEqual(['falta']);
  });
});
