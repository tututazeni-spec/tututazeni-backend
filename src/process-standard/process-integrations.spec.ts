import {
  catalogIndex,
  emptyMetrics,
  INTEGRATION_CATALOG,
  integrationStatus,
  normalizeModule,
  scopedIdempotencyKey,
} from './process-integrations';
import { auditActionLabel, csvCell, parseAuditMeta, auditRefs } from './process-audit-trail';
import { inferAuditSource, resolveAuditFields } from './process-audit';

describe('matriz de integração (§15)', () => {
  it('cobre a matriz do documento (48 linhas; «Instructor» e «Instructor / Formadores» fundidas), sem chaves repetidas', () => {
    const keys = INTEGRATION_CATALOG.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(47);
  });

  it('resolve nomes alternativos para o módulo certo', () => {
    const idx = catalogIndex();
    expect(idx.get(normalizeModule('Férias'))?.key).toBe('Leave');
    expect(idx.get(normalizeModule('Ferias'))?.key).toBe('Leave');
    expect(idx.get(normalizeModule('PDI'))?.key).toBe('DevelopmentPlans');
    expect(idx.get(normalizeModule('Payslips'))?.key).toBe('Payroll');
  });

  it('o estado vem da actividade real', () => {
    expect(integrationStatus(emptyMetrics())).toBe('NO_ACTIVITY');
    expect(integrationStatus({ ...emptyMetrics(), templates: 2 })).toBe('CONFIGURED');
    expect(integrationStatus({ ...emptyMetrics(), instances: 1 })).toBe('ACTIVE');
    expect(integrationStatus({ ...emptyMetrics(), instances: 1, failedEvents: 1 })).toBe('ERRORS');
  });

  it('a chave de idempotência é por módulo', () => {
    expect(scopedIdempotencyKey('Leave', ' abc ')).toBe('leave:abc');
    expect(scopedIdempotencyKey('Leave', 'abc')).not.toBe(scopedIdempotencyKey('Trainings', 'abc'));
  });
});

describe('auditoria (§13)', () => {
  it('rotula eventos conhecidos e degrada os desconhecidos', () => {
    expect(auditActionLabel('INSTANCE_STARTED')).toBe('Processo iniciado');
    expect(auditActionLabel('SOME_NEW_EVENT')).toBe('some new event');
  });

  it('lê o meta sem lançar', () => {
    expect(parseAuditMeta(null)).toBeNull();
    expect(parseAuditMeta('{"a":1}')).toEqual({ a: 1 });
    expect(parseAuditMeta('não é json')).toEqual({ raw: 'não é json' });
  });

  it('extrai referências a aprovação, documento e etapa', () => {
    expect(auditRefs({ approvalId: 5, processDocumentId: '7', stepId: 9 })).toEqual({
      approvalId: 5,
      documentId: 7,
      stepId: 9,
    });
    expect(auditRefs(null)).toEqual({ approvalId: null, documentId: null, stepId: null });
  });

  it('protege o CSV contra injecção de fórmulas e escapa vírgulas', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell(null)).toBe('');
  });

  it('infere a origem e os campos a partir do meta', () => {
    expect(inferAuditSource('process_start')).toBe('AUTOMATION');
    expect(inferAuditSource('INSTANCE_STARTED')).toBe('INTERFACE');
    const f = resolveAuditFields({
      userId: 1,
      action: 'INSTANCE_CANCELLED',
      meta: { reason: 'duplicado', from: 'IN_PROGRESS', to: 'CANCELLED' },
    });
    expect(f).toMatchObject({
      source: 'INTERFACE',
      reason: 'duplicado',
      previousStatus: 'IN_PROGRESS',
      newStatus: 'CANCELLED',
      result: 'SUCCESS',
    });
    expect(resolveAuditFields({ userId: 1, action: 'X', errorMessage: 'falhou' }).result).toBe(
      'FAILED',
    );
  });
});
