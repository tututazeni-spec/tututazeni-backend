# CRM → Financiadores → Novo Financiador

## ① Identificação do financiador

**Dados principais**

- Código do financiador — gerado automaticamente
- **Tipo de financiador:** Fundação, Banco, Instituição financeira, Governo, Agência de cooperação, Organização internacional, ONG, Empresa privada, Fundo de investimento, Fundo público, Embaixada, Organismo multilateral, Pessoa singular, Outro
- Nome oficial
- Nome comercial
- NIF / identificação fiscal — quando aplicável
- Nº de registo institucional — quando aplicável
- Logotipo
- Website
- **Estado:** Potencial, Em prospecção, Em negociação, Activo, Inactivo, Suspenso, Encerrado
- Data de registo
- Origem do financiador

## ② Dados institucionais

País, província, município, endereço, sector, tipo de organização, ano de fundação, nº de colaboradores (se aplicável), dimensão, descrição, missão, áreas de actuação, países/regiões onde financia, áreas temáticas financiadas.

**Áreas temáticas (selecção múltipla):** Educação, Formação profissional, Emprego, Juventude, Agricultura, Agronegócio, Saúde, Desenvolvimento comunitário, Inclusão social, Empreendedorismo, Tecnologia, Inovação, Sustentabilidade, Ambiente, Segurança alimentar, Desenvolvimento económico, Igualdade de oportunidades, Outro.

## ③ Contactos

Tal como nos parceiros, não deve existir apenas um contacto.

**Contacto principal:** nome, cargo, departamento, email, telefone, WhatsApp, canal preferencial, contacto principal.

**Outros contactos** — exemplo:

| Nome | Cargo | Departamento | Função |
|---|---|---|---|
| João Silva | Director | Programas | Decisor |
| Ana Costa | Programme Officer | Projectos | Técnico |
| Pedro Manuel | Finance Manager | Finanças | Financeiro |

**Papel do contacto:** Decisor, Técnico, Financeiro, Jurídico, Comunicação, Monitorização, Outro.

## ④ Perfil de financiamento

Principal diferença relativamente a Parceiros.

**Tipo de financiamento:** Subvenção / Grant, Doação, Empréstimo, Investimento, Bolsa, Financiamento institucional, Financiamento de projecto, Financiamento por resultados, Co-financiamento, Outro.

**Características:** valor mínimo habitual, valor máximo habitual, moeda, duração típica do financiamento, financia projectos?, financia programas?, financia organizações?, financia pessoas/bolsas?, exige co-financiamento?, percentagem máxima financiável, contrapartida exigida.

## ⑤ Áreas e critérios de elegibilidade

**Público-alvo financiável:** Jovens, Mulheres, Estudantes, Trabalhadores, Empreendedores, Agricultores, Comunidades, Empresas, Instituições, Organizações sociais, Outro.

**Critérios:** localização geográfica elegível, idade mínima, idade máxima, dimensão mínima do projecto, dimensão máxima do projecto, sectores elegíveis, tipo de organização elegível, prazo mínimo/máximo, requisitos de co-financiamento, outros critérios.

## ⑥ Programas e projectos financiados

Programa, projecto, área temática, beneficiários previstos, beneficiários alcançados, data de início, data de término, estado, responsável interno.

Exemplo: Fundação X · Programa Crescer · Projecto Formação profissional juvenil · 10.000 beneficiários previstos · 2026–2028.

## ⑦ Financiamentos

Deve ser uma entidade própria dentro do CRM.

**Novo financiamento:** código do financiamento, nome, financiador, programa/projecto, tipo de financiamento, valor solicitado, valor aprovado, valor desembolsado, valor utilizado, saldo, moeda, data de aprovação, data de início, data de término.

**Estado:** Em preparação, Candidatura submetida, Em avaliação, Aprovado, Contratado, Em execução, Concluído, Cancelado, Rejeitado.

## ⑧ Desembolsos

Criar um histórico, e não apenas um campo "valor desembolsado":

| Parcela | Data | Valor | Estado |
|---|---|---|---|
| 1ª | 15/01/2026 | 500.000 USD | Recebida |
| 2ª | 15/07/2026 | 300.000 USD | Prevista |
| 3ª | 15/01/2027 | 200.000 USD | Prevista |

Cada desembolso: nº da parcela, data prevista, data efectiva, valor, moeda, estado, comprovativo, observações.

## ⑨ Candidaturas / oportunidades de financiamento

Antes de existir financiamento, deve existir uma oportunidade.

**Dados:** nome da oportunidade, financiador, programa/projecto, área temática, valor potencial, moeda, data de abertura, prazo de candidatura, data prevista de decisão, responsável interno.

**Estado:** Identificada, Em análise, Em preparação, Submetida, Em avaliação, Aprovada, Rejeitada, Retirada.

**Documentos:** termos de referência, call for proposals, formulário, orçamento, proposta técnica, outros anexos.

## ⑩ Contratos e acordos

**Tipo:** Contrato de financiamento, Grant Agreement, Acordo de cooperação, Memorando, Outro.

Nº do contrato, data de assinatura, data de início, data de término, valor, moeda, responsável interno, responsável do financiador, condições, obrigações, cláusulas relevantes, renovação, estado.

## ⑪ Requisitos de reporte

**Relatórios exigidos:** relatório financeiro, relatório técnico, relatório de progresso, relatório de impacto, auditoria, avaliação externa, outros.

**Para cada relatório:** tipo, periodicidade, data limite, responsável, estado, data de submissão, documento, observações.

## ⑫ Indicadores e impacto

Beneficiários previstos, beneficiários alcançados, nº de mulheres, nº de homens (quando pertinente), nº de jovens, nº de formações, nº de participantes, horas de formação, empregos criados, empreendedores apoiados, comunidades alcançadas, províncias abrangidas, outros KPIs do projecto.

Os indicadores devem ser **configuráveis por programa/projecto**.

## ⑬ Beneficiários financiados

Financiador → Programa → Projecto → Beneficiários

Exemplo: Fundação X → Programa Crescer → Projecto Formação Agrícola → 2.500 beneficiários. O beneficiário não é duplicado; apenas fica criada a relação.

## ⑭ Parceiros associados

Financiador ↔ Parceiro ↔ Programa/Projecto — particularmente importante em projectos com consórcios ou co-financiamento.

## ⑮ Actividades e relacionamento

**Timeline:** contacto, email, reunião, apresentação de projecto, candidatura, negociação, follow-up, visita, avaliação, assinatura de contrato, relatório, renovação.

**Cada actividade:** data, tipo, responsável, participantes, descrição, resultado, próxima acção, data do próximo contacto.

## ⑯ Documentos

Contratos, grant agreements, candidaturas, propostas, orçamentos, relatórios, auditorias, comprovativos, termos de referência, avaliações, certificados, outros — com tipo, nome, data, validade, versão, responsável, estado.

## ⑰ Responsável interno

Gestor do financiador, unidade, departamento, equipa, data de atribuição, responsável financeiro, responsável técnico.

## ⑱ Notas e informação interna

Notas internas, estratégia de relacionamento, histórico relevante, observações, tags, campos personalizados.

## ⑲ Privacidade e controlo

Consentimentos (quando aplicáveis), preferências de comunicação, registo de alterações, criado por, data de criação, última alteração, alterado por.

---

## Formulário "Novo Financiador" — por etapas

1. **Identificação** — nome, tipo, NIF, estado e contactos básicos
2. **Organização** — localização, sector, missão e áreas de actuação
3. **Perfil de financiamento** — tipos, valores, moedas, duração e modalidades
4. **Critérios** — público-alvo, sectores, localização e requisitos
5. **Programas & Projectos** — programas/projectos relacionados
6. **Oportunidades** — calls, candidaturas e oportunidades identificadas
7. **Financiamentos** — financiamentos aprovados, valores e desembolsos
8. **Contratos & Reportes** — contratos, obrigações e relatórios
9. **Revisão** — resumo de todos os dados

**Botões:** Guardar como potencial · Guardar e activar · Cancelar

---

## Perfil do Financiador depois de criado

**FINANCIADOR X — Activo · Financiador Institucional**

**KPIs no topo:** financiamentos activos, valor total aprovado, valor desembolsado, projectos financiados, beneficiários alcançados, próximo reporte.

**Abas:** Visão geral | Contactos | Oportunidades | Financiamentos | Desembolsos | Programas & Projectos | Parceiros | Beneficiários | Reportes | Documentos | Actividades | Histórico

---

## Estrutura CRM resultante

```
CRM
├── Beneficiários     → Quem recebe o benefício
├── Parceiros         → Quem colabora na execução
├── Financiadores     → Quem financia
├── Oportunidades     → Possíveis parcerias/financiamentos
├── Programas         → Grandes iniciativas
├── Projectos         → Execução concreta
├── Financiamentos    → Acordos financeiros
├── Desembolsos       → Entradas de financiamento
└── Actividades       → Relacionamento e acompanhamento
```
