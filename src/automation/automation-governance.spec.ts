import { TriggerType, ActionType } from './automation.dto';
import { validateFlow, FlowDefinition } from './automation-flow';
import {
  AUTOMATION_TEMPLATES,
  coerceTemplateValues,
  resolveTemplateValues,
} from './automation-templates.catalog';
import { diffFields } from './automation-audit.service';
import { ruleInDepartment } from './automation-access.service';
import { decryptSecret, encryptSecret } from './automation-connections.service';
import { redactSensitive } from './automation-redact.util';

describe('modelos de automação (§11)', () => {
  it('existem os 11 modelos previstos, com chaves únicas', () => {
    expect(AUTOMATION_TEMPLATES).toHaveLength(11);
    expect(new Set(AUTOMATION_TEMPLATES.map(t => t.key)).size).toBe(11);
  });

  it.each(AUTOMATION_TEMPLATES.map(t => [t.key, t] as const))(
    '%s: gatilho existente e fluxo válido com os valores por omissão',
    (_key, t) => {
      expect(Object.values(TriggerType)).toContain(t.trigger);
      // Preenche os obrigatórios sem omissão com valores de exemplo.
      const input: Record<string, unknown> = {};
      for (const f of t.fields) {
        if (f.required && f.default === undefined) input[f.key] = f.type === 'text' ? 'x' : 1;
      }
      const { values, errors } = coerceTemplateValues(t, input);
      expect(errors).toEqual([]);
      const flow = resolveTemplateValues(t.flow, values) as FlowDefinition;
      const check = validateFlow(flow);
      expect(check.errors).toEqual([]);
      expect(JSON.stringify(flow)).not.toContain('${');
      for (const step of flow.steps) {
        if (step.type === 'action') expect(Object.values(ActionType)).toContain(step.action);
      }
    },
  );

  it('campo obrigatório em falta devolve erro legível', () => {
    const t = AUTOMATION_TEMPLATES.find(x => x.key === 'onboarding-novo-colaborador')!;
    const { errors } = coerceTemplateValues(t, {});
    expect(errors.join(' ')).toContain('Curso de integração');
  });

  it('marcador opcional sem valor remove a propriedade', () => {
    const out = resolveTemplateValues({ a: '${x}', b: 'ROLE:${r}' }, { r: 'RH' });
    expect(out).toEqual({ b: 'ROLE:RH' });
  });

  it('valor numérico mantém o tipo quando o marcador ocupa o texto todo', () => {
    expect(resolveTemplateValues({ n: '${n}' }, { n: 5 })).toEqual({ n: 5 });
  });
});

describe('auditoria e âmbito (§10)', () => {
  it('diffFields devolve só os campos que mudaram', () => {
    expect(diffFields({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ before: { b: 2 }, after: { b: 3 } });
  });

  it('ruleInDepartment compara por departamento e rejeita regras sem âmbito', () => {
    expect(ruleInDepartment('["3","5"]', 5)).toBe(true);
    expect(ruleInDepartment('["3"]', 5)).toBe(false);
    expect(ruleInDepartment(null, 5)).toBe(false);
    expect(ruleInDepartment('["5"]', null)).toBe(false);
    expect(ruleInDepartment('não é json', 5)).toBe(false);
  });
});

describe('segredos (§10)', () => {
  const OLD = process.env.AUTOMATION_SECRET_KEY;
  beforeAll(() => {
    process.env.AUTOMATION_SECRET_KEY = 'chave-de-teste';
  });
  afterAll(() => {
    if (OLD === undefined) delete process.env.AUTOMATION_SECRET_KEY;
    else process.env.AUTOMATION_SECRET_KEY = OLD;
  });

  it('cifra e decifra sem expor o texto em claro', () => {
    const blob = encryptSecret('s3gredo-muito-longo');
    expect(blob).not.toContain('s3gredo');
    expect(decryptSecret(blob)).toBe('s3gredo-muito-longo');
  });

  it('cada cifra usa um IV diferente', () => {
    expect(encryptSecret('abc')).not.toBe(encryptSecret('abc'));
  });

  it('o redactor oculta segredos de ligações nos registos', () => {
    expect(redactSensitive({ secret: 'x', headers: { Authorization: 'Bearer abcdefgh12345' } })).toEqual({
      secret: '***',
      headers: { Authorization: '***' },
    });
  });
});
