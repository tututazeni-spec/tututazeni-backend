import {
  findUnknownVariables,
  OPTIONAL_VARIABLES,
  renderParagraph,
  renderVariables,
  TEMPLATE_VARIABLES,
} from './template-variables';

describe('lista de variáveis', () => {
  it('tem as 14 variáveis do prompt', () => {
    expect([...TEMPLATE_VARIABLES].sort()).toEqual(
      [
        'assinatura_responsavel',
        'carga_horaria',
        'codigo_certificado',
        'competencias_adquiridas',
        'data_emissao',
        'data_validade',
        'nome_completo',
        'nome_curso',
        'nome_empresa',
        'nome_formacao',
        'nome_instrutor',
        'nome_trilha',
        'nota_final',
        'qr_code',
      ].sort(),
    );
  });

  it('as opcionais são subconjunto das conhecidas', () => {
    for (const v of OPTIONAL_VARIABLES) expect(TEMPLATE_VARIABLES).toContain(v);
  });
});

describe('findUnknownVariables', () => {
  it('conhecidas (com espaços) passam', () => {
    expect(findUnknownVariables('{{nome_completo}} e {{ nome_curso }}')).toEqual([]);
  });

  it('devolve as desconhecidas, sem repetir, e é sensível a maiúsculas', () => {
    expect(findUnknownVariables('{{foo}} {{foo}} {{ NOME_CURSO }} {{nome_curso}}')).toEqual([
      'foo',
      'NOME_CURSO',
    ]);
  });

  it('texto sem variáveis → vazio', () => {
    expect(findUnknownVariables('Olá mundo')).toEqual([]);
  });
});

describe('renderVariables', () => {
  const values = { nome_completo: 'Ana Silva', nome_curso: 'Segurança' };

  it('substitui variáveis simples', () => {
    expect(
      renderVariables('Certificamos que {{nome_completo}} concluiu {{nome_curso}}.', values),
    ).toBe('Certificamos que Ana Silva concluiu Segurança.');
  });

  it('não re-expande um valor que contenha uma variável', () => {
    expect(
      renderVariables('{{nome_completo}}', { nome_completo: '{{nome_curso}}', nome_curso: 'X' }),
    ).toBe('{{nome_curso}}'.replace(/\{\{|\}\}/g, ''));
  });

  it('linha só com variável opcional em falta é omitida (null)', () => {
    expect(renderVariables('Nota final: {{nota_final}}', values)).toBeNull();
    expect(renderVariables('Válido até {{data_validade}}', values)).toBeNull();
    expect(renderVariables('{{nome_instrutor}}', values)).toBeNull();
  });

  it('frase sem separadores com um opcional em falta é omitida inteira', () => {
    // Regra documentada: informação opcional vai na sua linha ou entre "·".
    expect(renderVariables('Concluiu {{nome_curso}} com nota {{nota_final}}.', values)).toBeNull();
  });

  it('segmentos separados por "·" ou "|" caem um a um', () => {
    expect(
      renderVariables(
        'Carga horária: {{carga_horaria}} · Nota: {{nota_final}} · Emitido em {{data_emissao}}',
        {
          carga_horaria: '40 h',
          data_emissao: '20/10/2026',
        },
      ),
    ).toBe('Carga horária: 40 h · Emitido em 20/10/2026');
    expect(renderVariables('A {{nome_curso}} | Nota {{nota_final}}', values)).toBe('A Segurança');
  });

  it('separadores soltos no fim desaparecem', () => {
    expect(
      renderVariables('Emitido em {{data_emissao}} · Válido até {{data_validade}}', {
        data_emissao: '20/10/2026',
      }),
    ).toBe('Emitido em 20/10/2026');
  });

  it('opcional presente é usada', () => {
    expect(renderVariables('Nota final: {{nota_final}}', { nota_final: '87%' })).toBe(
      'Nota final: 87%',
    );
  });

  it('texto sem variáveis fica igual', () => {
    expect(renderVariables('Parabéns!', {})).toBe('Parabéns!');
  });

  it('marcadores de bloco (assinatura, QR) não deixam texto', () => {
    expect(renderVariables('{{assinatura_responsavel}}', {})).toBeNull();
    expect(renderVariables('{{qr_code}}', {})).toBeNull();
  });

  it('nunca devolve {{ }} mesmo com variáveis desconhecidas', () => {
    const out = renderVariables('Olá {{ninguem}} {{nome_completo}}', values);
    expect(out).not.toMatch(/\{\{|\}\}/);
    expect(out).toBe('Olá Ana Silva');
  });
});

describe('renderParagraph', () => {
  it('parte por linhas e omite as nulas', () => {
    expect(
      renderParagraph('Concluiu {{nome_curso}}\nNota: {{nota_final}}\nObrigado', {
        nome_curso: 'Segurança',
      }),
    ).toEqual(['Concluiu Segurança', 'Obrigado']);
  });

  it('nunca devolve linhas vazias nem {{', () => {
    const lines = renderParagraph('{{nome_instrutor}}\n\n{{x}}\nOk', {});
    expect(lines).toEqual(['Ok']);
  });
});
