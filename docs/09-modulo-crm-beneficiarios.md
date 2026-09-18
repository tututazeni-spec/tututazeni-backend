# CRM → Beneficiários

## Acréscimos ao formulário "+ Novo Beneficiário"

### Dados principais do beneficiário

Código/ID do beneficiário, número de beneficiário, estado civil, NIF, documento de identificação, número do documento de identificação, data de emissão, data de validade, país de emissão, fotografia, telefone alternativo, e-mail, endereço, província, município, comuna, bairro, código postal, país, contacto de emergência.

### Classificação CRM

Categoria, segmento, perfil, origem, programa associado, instituição de origem, beneficiário individual ou institucional, estado do beneficiário, data de registo, responsável pelo acompanhamento, unidade responsável, gestor de conta, prioridade.

### Dados do agregado / enquadramento

Agregado familiar, número de dependentes, responsável pelo agregado, relação com responsável, situação profissional, entidade empregadora, cargo, rendimento mensal, fonte de rendimento, situação habitacional, necessidades identificadas.

### Benefícios / serviços

Benefícios atribuídos, serviços recebidos, programas frequentados, formação frequentada, cursos concluídos, bolsas atribuídas, apoios recebidos, valor do apoio, data de atribuição, data de início, data de fim, estado do benefício, elegibilidade, critérios de elegibilidade.

### Acompanhamento

Data do último contacto, próximo contacto, responsável pelo acompanhamento, estado do acompanhamento, necessidades identificadas, objetivos definidos, plano de acompanhamento, observações, grau de satisfação, resultado do acompanhamento, próximas ações.

### Interações CRM

Tipo de interação, data e hora, canal, assunto, descrição, responsável, beneficiário relacionado, resultado, próxima ação, data da próxima ação, anexos, observações.

**Tipos de interação:** E-mail, Telefone, WhatsApp, SMS, Presencial, Videochamada, Portal, Aplicação móvel, Outro.

### Documentos

Tipo de documento, número do documento, data de emissão, data de validade, ficheiro, estado de validação, validado por, data de validação, observações.

### Consentimentos e privacidade

Consentimento para tratamento de dados, consentimento para comunicações, consentimento para partilha de dados, canais autorizados, data do consentimento, estado do consentimento, data de revogação, preferências de comunicação.

### Estado CRM

Activo, Inactivo, Em acompanhamento, Suspenso, Elegível, Não elegível, Benefício activo, Benefício terminado, Arquivado.

### Auditoria

Criado por, data de criação, última atualização, atualizado por, histórico de alterações, registo de actividades.

### Para CRM de beneficiários de programas sociais/formação

Programa, projecto, província, município, localidade, turma, edição do programa, data de inscrição, data de início, data de conclusão, estado da participação, presença, aproveitamento, certificação, empregabilidade, encaminhamento, resultado final, impacto gerado.

---

# Novo Beneficiário — cadastro completo

## 1. Identificação do beneficiário

- **Tipo de beneficiário:** Pessoa singular, Pessoa colectiva/organização, Grupo/comunidade
- Código/ID do beneficiário — gerado automaticamente
- Nome completo / nome da organização
- Nome pelo qual é conhecido
- Fotografia/logo — opcional
- **Estado:** Activo, Inactivo, Suspenso, Arquivado
- Data de registo
- **Origem do cadastro:** Manual, Importação, Programa, Parceiro, Outro

## 2. Dados pessoais (Pessoa Singular)

Nome próprio, nome do meio, apelido, data de nascimento, sexo, nacionalidade, naturalidade, estado civil, nº de identificação (sem obrigar a anexar o documento), NIF (se aplicável), NIB/IBAN (apenas quando necessário para pagamentos/bolsas), contacto telefónico, WhatsApp, email, contacto alternativo.

## 3. Localização

País, província, município, comuna, localidade, bairro, endereço, código postal (se aplicável), coordenadas geográficas (opcional), **zona:** Urbana / Periurbana / Rural.

Para projectos em Angola, esta parte é particularmente importante para permitir análises por província, município e comunidade.

## 4. Situação profissional e socioeconómica

- **Situação profissional:** Empregado, Desempregado, Estudante, Empreendedor, Agricultor, Trabalhador informal, Outro
- Profissão, sector de actividade, empresa/organização, cargo/função
- Rendimento mensal (se realmente necessário), fonte principal de rendimento
- Dimensão do agregado familiar, nº de dependentes, situação habitacional, condição socioeconómica (se fizer parte do programa)

## 5. Educação e qualificações

Nível de escolaridade, área de formação, curso, instituição de ensino, ano de conclusão, grau académico, certificações, competências principais, literacia digital, necessidades de formação identificadas.

## 6. Programa / projecto

Uma das partes mais importantes do CRM.

**Beneficiário associado a:** programa, projecto, iniciativa, campanha, unidade responsável, coordenador responsável, gestor de conta/caso.

**Dados da participação:** data de entrada, data de saída, **estado da participação** (Candidato, Inscrito, Activo, Concluído, Suspenso, Desistente), tipo de benefício, objectivo do apoio, valor do benefício (quando aplicável), periodicidade, nº de benefícios recebidos, último benefício recebido.

## 7. Benefícios recebidos

Deve existir uma relação histórica, e não apenas um campo:

| Data | Programa | Benefício | Quantidade/Valor | Estado |
|---|---|---|---|---|
| 10/03/2026 | Crescer | Formação | 1 | Concluído |
| 20/04/2026 | Programa X | Bolsa | 150.000 Kz | Pago |

Cada registo pode abrir o detalhe do benefício.

## 8. Formação e aprendizagem

Integração directa com o módulo académico: cursos frequentados, cursos concluídos, percursos de aprendizagem, sessões frequentadas, horas de formação, certificados, aproveitamento, competências adquiridas, formação actualmente em curso, próximas formações.

## 9. Interacções / histórico CRM

**Timeline:** contacto telefónico, email, WhatsApp, atendimento, reunião, inscrição, formação, benefício atribuído, documento recebido, alteração de dados, reclamação, pedido de apoio, follow-up, nota interna.

**Cada actividade:** data/hora, tipo, responsável, descrição, resultado, próxima acção, data do próximo follow-up.

## 10. Documentos

Certificados, comprovativos, declarações, formulários, documentos administrativos, outros documentos do programa — com nome, tipo, data, validade, estado, quem carregou, histórico de versões.

> **Importante:** não colocar documentos de identificação sensíveis como requisito geral do cadastro; devem ser solicitados apenas quando houver uma finalidade legítima e necessária.

## 11. Necessidades / acompanhamento

Necessidades identificadas, objectivos, barreiras identificadas, tipo de apoio necessário, nível de prioridade, plano de acompanhamento, responsável pelo acompanhamento, próxima intervenção, data do próximo contacto, estado do acompanhamento.

## 12. Consentimentos e privacidade

Consentimento para tratamento de dados, finalidade do tratamento, data do consentimento, canal através do qual foi obtido, consentimento para comunicações, preferências de comunicação, estado do consentimento, data de revogação (se aplicável), registo de alterações.

## 13. Comunicação

**Preferências:** telefone, SMS, WhatsApp, email, notificações INNOVA. E ainda: idioma preferencial, horário preferencial de contacto, canal preferencial.

## 14. Campos internos

Visíveis apenas para utilizadores autorizados: responsável pelo beneficiário, unidade, departamento, segmento, categoria, prioridade, tags, notas internas, classificação interna, origem, campanha de origem.

## 15. Relações

O beneficiário pode estar relacionado com: Partner, Funder, Programa, Projecto, beneficiários do mesmo agregado, organização, formador, colaborador responsável.

Exemplo: Beneficiário → Programa Crescer → Funder → Partner → Unidade responsável — permitindo construir uma verdadeira visão 360°.

---

## Ecrã "Novo Beneficiário" — por etapas

1. **Identificação** — dados básicos e tipo de beneficiário
2. **Contactos** — telefone, WhatsApp, email e preferências
3. **Localização** — País → Província → Município → Comuna → Localidade
4. **Perfil** — educação, profissão e situação socioeconómica
5. **Programa** — programa/projecto, participação e benefício
6. **Necessidades** — objectivos, necessidades e acompanhamento
7. **Privacidade** — consentimentos e preferências de comunicação
8. **Documentos** — documentos necessários ao programa
9. **Revisão** — resumo de tudo antes de guardar

**Botões:** Guardar beneficiário | Guardar e adicionar outro | Cancelar

---

## Estrutura conceptual recomendada

O "Beneficiário" não deve ser um simples cadastro de contactos — deve ser a **entidade central do CRM**:

Beneficiário → Perfil → Programas → Benefícios → Formação → Interacções → Acompanhamento → Documentos → Comunicações → Consentimentos → Histórico

O mesmo beneficiário deve poder aparecer em dashboards e relatórios de impacto: número de beneficiários, beneficiários activos, distribuição geográfica, beneficiários por programa, horas de formação, benefícios atribuídos e resultados alcançados.
