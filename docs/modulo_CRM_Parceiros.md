# CRM → Parceiros → Novo Parceiro

## ① Identificação do parceiro

### Dados principais

- Código do parceiro — gerado automaticamente
- **Tipo de parceiro:**
  - Empresa
  - ONG
  - Instituição pública
  - Instituição de ensino
  - Organização internacional
  - Associação
  - Fundação
  - Banco / instituição financeira
  - Fornecedor
  - Parceiro tecnológico
  - Parceiro de formação
  - Outro
- Nome oficial
- Nome comercial
- NIF
- Logotipo
- Website
- **Estado:**
  - Potencial
  - Em negociação
  - Activo
  - Inactivo
  - Suspenso
  - Encerrado
- Data de registo
- Origem do parceiro

---

## ② Dados institucionais

- País
- Província
- Município
- Endereço
- Código postal
- Sector de actividade
- Dimensão da organização
- Nº de colaboradores
- Ano de fundação
- Tipo de organização
- Nº de identificação/registo empresarial
- Descrição da organização
- Missão
- Áreas de actuação
- Principais serviços/produtos

### Classificação

- Categoria do parceiro
- Segmento
- Tags
- Área de especialização
- **Nível de parceria:**
  - Estratégico
  - Institucional
  - Operacional
  - Técnico
  - Comercial
  - Formação
  - Comunitário

---

## ③ Contactos

Um parceiro pode ter vários contactos, portanto não criaria apenas um campo "nome do contacto".

### Contacto principal

- Nome
- Apelido
- Cargo
- Departamento
- Email
- Telefone
- WhatsApp
- Canal preferencial
- Contacto principal? Sim/Não

### Outros contactos

Exemplo:

| Nome | Cargo | Departamento | Email | Principal |
|---|---|---|---|---|
| João Silva | Director | RH | ... | Sim |
| Ana Costa | Coordenadora | Formação | ... | Não |
| Pedro Manuel | Técnico | Projectos | ... | Não |

---

## ④ Tipo de parceria

Aqui deve ficar registado como o parceiro participa na INNOVA. Pode seleccionar vários:

- Formação
- Educação
- Emprego
- Estágios
- Recrutamento
- Financiamento
- Implementação de projectos
- Apoio técnico
- Fornecimento
- Tecnologia
- Conteúdo
- Eventos
- Mentoria
- Investigação
- Certificação
- Logística
- Comunicação
- Responsabilidade social
- Desenvolvimento comunitário
- Outro

---

## ⑤ Programas e projectos

Permitir associar o parceiro aos programas existentes na INNOVA.

**Campos:**

- Programa
- Projecto
- Área de intervenção
- Papel do parceiro
- Data de início
- Data de término
- Estado
- Responsável interno

**Exemplo:**

- Parceiro: Instituição X
- Programa: Crescer
- Papel: Parceiro de formação
- Período: 2026–2028
- Estado: Activo

---

## ⑥ Acordos e contratos

Muito importante para parceiros institucionais.

### Novo acordo

- **Tipo:**
  - Memorando de entendimento
  - Contrato
  - Protocolo
  - Acordo de parceria
  - Termo de colaboração
  - Outro
- Número do documento
- Data de assinatura
- Data de início
- Data de término
- Renovação automática
- Responsável interno
- Responsável do parceiro
- **Estado:**
  - Em preparação
  - Em negociação
  - Activo
  - Expirado
  - Terminado
- Valor do acordo — se aplicável
- Condições principais
- Observações

### Documento

Permitir anexar o acordo/contrato e manter histórico de versões.

---

## ⑦ Contribuição do parceiro

Esta secção permite saber o que o parceiro fornece ao programa/projecto.

### Tipo de contribuição

- Financeira
- Recursos humanos
- Equipamentos
- Instalações
- Formação
- Conteúdo
- Tecnologia
- Serviços
- Logística
- Bolsas
- Materiais
- Rede de contactos
- Conhecimento técnico
- Outro

### Detalhes

- Descrição da contribuição
- Quantidade
- Valor estimado
- Periodicidade
- Data de início
- Data de término

---

## ⑧ Financiamento

Se o parceiro também financiar iniciativas, eu manteria a relação com o módulo **CRM → Funders**, em vez de duplicar toda a informação.

**No parceiro:**

- É financiador? Sim/Não
- Funders associados
- Programas financiados
- Valor financiado
- Moeda
- Período de financiamento

Assim, Partner e Funder podem ser entidades diferentes, mas uma organização pode exercer os dois papéis.

---

## ⑨ Beneficiários relacionados

Permitir visualizar os beneficiários impactados pela parceria.

**Exemplo:**

```text
Parceiro X → Programa Y → 2.500 beneficiários → 11 províncias → 15 cursos → 4.800 horas de formação
```

Não é necessário cadastrar os beneficiários novamente. Apenas criar as relações.

---

## ⑩ Actividades e interacções

### Timeline do relacionamento

- Telefonema
- Email
- Reunião
- Apresentação
- Negociação
- Visita
- Evento
- Formação
- Follow-up
- Renovação de contrato
- Envio de documentação
- Nota interna

### Cada actividade

- Data
- Hora
- Tipo
- Responsável
- Participantes
- Descrição
- Resultado
- Próxima acção
- Data do próximo contacto

---

## ⑪ Oportunidades de parceria

Esta parte é importante para transformar o CRM num CRM realmente comercial/institucional.

### Nova oportunidade

- Nome da oportunidade
- Programa/projecto
- Tipo de parceria
- Responsável
- Valor potencial
- Moeda
- Probabilidade interna — se a organização quiser acompanhar pipeline
- Data prevista
- **Estado:**
  - Identificada
  - Contactada
  - Em discussão
  - Proposta enviada
  - Em negociação
  - Acordo alcançado
  - Não concretizada

> **Nota:** eu separaria claramente oportunidade de parceria activa.

---

## ⑫ Desempenho da parceria

Depois de o parceiro estar activo:

- Programas apoiados
- Beneficiários alcançados
- Formações realizadas
- Nº de participantes
- Horas de formação
- Valor investido
- Contribuições realizadas
- Projectos concluídos
- Projectos em curso
- Cumprimento de compromissos
- Indicadores de impacto

Isso alimenta posteriormente o Dashboard de Parceiros.

---

## ⑬ Documentos

### Documentos associados

- Contratos
- Protocolos
- Memorandos
- Certidões
- Propostas
- Relatórios
- Comprovativos
- Certificados
- Documentos institucionais
- Outros

### Cada documento

- Tipo
- Nome
- Data
- Validade
- Estado
- Responsável
- Versão
- Observação

---

## ⑭ Localizações

Se um parceiro tiver várias instalações:

### Sede

- País
- Província
- Município
- Endereço

### Filiais / Delegações

| Local | Província | Município | Tipo |
|---|---|---|---|
| Sede | Luanda | Luanda | Sede |
| Delegação | Benguela | Benguela | Delegação |

---

## ⑮ Responsável interno

- Gestor do parceiro
- Unidade
- Departamento
- Equipa
- Data de atribuição
- Estado do relacionamento

Isto permite saber imediatamente: *Quem dentro da INNOVA é responsável por este parceiro?*

---

## ⑯ Comunicação e consentimentos

- Email permitido
- WhatsApp permitido
- SMS permitido
- Telefone permitido
- Comunicações institucionais
- Convites para eventos
- Comunicações de programas
- Preferências de contacto
- Data do consentimento
- Observações

---

## ⑰ Campos personalizados

Eu incluiria um sistema de campos personalizados, para que o administrador possa criar campos sem alterar o código.

**Exemplo:**

- Tipo de certificação = ISO 9001
- Área de especialização = Agronegócio
- Nº de beneficiários previstos = 5.000
- Províncias abrangidas = 11

---

## Como ficaria o formulário "Novo Parceiro"

Eu faria **8 etapas**, para não transformar o ecrã num formulário gigantesco:

1. **Identificação** — Nome, NIF, tipo, categoria, logotipo.
2. **Organização** — Sector, dimensão, localização, descrição e áreas de actuação.
3. **Contactos** — Contacto principal + outros contactos.
4. **Parceria** — Tipo de parceria, áreas e papel do parceiro.
5. **Programas & Projectos** — Programas associados e período de participação.
6. **Acordos** — Contratos, protocolos e documentos.
7. **Contribuições** — Financeiras, técnicas, formação, equipamentos, serviços, etc.
8. **Revisão & Activação** — Resumo → validar → criar parceiro.

**Botões:**

- Guardar como potencial
- Guardar e activar
- Cancelar

---

## O perfil do parceiro

Depois de criado, o registo poderia apresentar:

**Parceiro X**
Activo · Parceiro Estratégico

### Resumo

- Programas: 6
- Projectos: 4
- Beneficiários alcançados: 8.450
- Acordos activos: 3
- Contribuição: X
- Último contacto: 12/09/2026

### Abas

Visão geral | Contactos | Programas & Projectos | Acordos | Contribuições | Beneficiários | Actividades | Documentos | Oportunidades | Histórico

---

## Estrutura CRM que recomendo para a INNOVA

```text
CRM
├── Beneficiários
│   └── Pessoas que recebem o benefício
│
├── Parceiros
│   └── Organizações que colaboram
│
├── Funders
│   └── Entidades que financiam
│
├── Programas
│   └── Iniciativas executadas
│
├── Projectos
│   └── Projectos específicos
│
├── Oportunidades
│   └── Parcerias ainda não concretizadas
│
└── Actividades
    └── Interacções e acompanhamento
```
