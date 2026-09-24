# Módulo Departments

## Abas principais

Visão Geral, Departamentos, Estrutura Organizacional, Equipas, Responsáveis, Cargos & Funções, Lotação, Organograma, Histórico, Relatórios, Configurações

## 1. Visão Geral

Painel resumido do departamento.

**Informações:**

- Nome do departamento
- Código
- Sigla
- Estado
- Unidade/empresa
- Localização
- Responsável
- Substituto do responsável
- Departamento superior
- Nível hierárquico
- Data de criação
- N.º de colaboradores
- Headcount previsto
- Headcount atual
- N.º de cargos ativos
- N.º de subdepartamentos
- Formações em curso
- Avaliações pendentes
- Objetivos ativos
- KPIs do departamento
- Indicadores de desempenho
- Orçamento anual
- Execução orçamental
- Atividades recentes
- Alertas/pendências

## 2. Departamentos

Lista e gestão de todos os departamentos.

**Tabela:**

- Nome
- Código
- Sigla
- Departamento superior
- Unidade/empresa
- Responsável
- N.º de colaboradores
- N.º de subdepartamentos
- Localização
- Estado
- Data de criação
- Última atualização

**Filtros:** Unidade, Estado, Departamento superior, Responsável, Localização, Data de criação

**Ações:** Ver, Editar, Ativar/desativar, Arquivar, Eliminar, Exportar

### Ao clicar em "Novo Departamento"

**Identificação:** nome do departamento, código, sigla, descrição, categoria/área, departamento-pai, nível hierárquico

**Estrutura:** unidade, localização, área de negócio, departamento superior, subdepartamentos, centro de custo

**Responsabilidade:** responsável pelo departamento, substituto, contacto institucional, email institucional, telefone

**Lotação:** número de colaboradores previsto, número de colaboradores atual, vagas disponíveis, limite máximo

**Cargos & Funções:** cargos existentes no departamento, funções, posições previstas, posições ocupadas

**Estado:** ativo/inativo, data de criação, data de início, data de encerramento, motivo de encerramento

**Configurações:** permissões do departamento, regras de aprovação, aprovadores, visibilidade dos dados, departamento responsável por processos

### Estrutura de um departamento

Um departamento deve permitir visualizar:

```
Departamento → Subdepartamentos → Equipas → Responsável → Colaboradores → Cargos → Posições
```

**Exemplo:**

```
Direção de Recursos Humanos → Gestão de Pessoas → Formação & Academia →
Recrutamento & Seleção → Administração de RH
```

### O que deve aparecer na aba de um departamento

Informação Geral, Organograma, Colaboradores, Equipas, Cargos & Funções, Vagas, Responsáveis, Objetivos, Indicadores, Documentos, Histórico de Alterações

Os indicadores aqui devem ser apenas informações organizacionais — por exemplo, número de colaboradores, vagas, distribuição por cargo e estrutura — e não um módulo de Monitoring/Indicators separado.

### Modelos principais

Manter separados:

- `Department`
- `DepartmentMember` (ou relação com `User`/`Employee`)
- `DepartmentManager`
- `Team`
- `Position`
- `DepartmentHistory`

Evitar colocar todos os dados diretamente em `Department`.

### Integrações

O módulo Departments deve alimentar automaticamente: Users/Colaboradores, Cargos, Equipas, Férias & Licenças, Avaliação, Competências, PDI, Formação/Trainings, Cursos, Relatórios e Organograma.

Assim, quando um colaborador muda de departamento, a alteração é refletida nos restantes módulos sem duplicar informação.

## 3. Estrutura Organizacional

Árvore hierárquica da organização.

**Informações:**

- Empresa/unidade
- Departamento
- Departamento superior
- Subdepartamentos
- Nível hierárquico
- Responsável
- N.º de colaboradores
- N.º de cargos
- Localização

**Visualizações:** Árvore organizacional, Organograma, Lista hierárquica

**Ao clicar num departamento:** Responsável, Colaboradores, Subdepartamentos, Cargos, Estrutura descendente

## 4. Responsáveis

Gestão das pessoas que lideram os departamentos.

**Informações:**

- Departamento
- Responsável
- Cargo
- Substituto
- Data de início da responsabilidade
- Data de fim
- Estado
- Contacto profissional
- N.º de colaboradores sob responsabilidade
- Subdepartamentos sob responsabilidade

**Histórico:** Responsável anterior, Novo responsável, Data da alteração, Motivo, Alterado por

## 5. Colaboradores

Lista dos colaboradores alocados ao departamento.

**Informações:**

- Nome
- Nº de colaborador
- Fotografia/avatar
- E-mail
- Telefone
- Cargo
- Função
- Departamento
- Subdepartamento
- Responsável direto
- Unidade
- Localização
- Data de admissão
- Estado
- Tipo de vínculo

**Indicadores:** Total de colaboradores, Ativos, Inativos, Por género, Por faixa etária, Por cargo, Por localização, Por tipo de vínculo

Os dados completos do colaborador continuam no módulo Users/Colaboradores. Aqui mostram-se apenas os dados necessários para a gestão departamental.

## 6. Cargos & Funções

Cargos existentes dentro daquele departamento.

**Informações:**

- Cargo
- Código do cargo
- Função
- N.º de posições
- N.º de posições ocupadas
- N.º de vagas
- Departamento
- Responsável hierárquico
- Nível hierárquico
- Família profissional
- Estado
- Data de criação

**Ao abrir um cargo:** Descrição da função, Responsabilidades, Requisitos, Competências, Formação necessária, Experiência necessária, Colaboradores nesse cargo, Estrutura salarial (se aplicável), Vagas

## 7. Hierarquia

Mais específica que a Estrutura Organizacional: a Estrutura Organizacional mostra a organização como um todo; a Hierarquia mostra as relações de reporte.

**Informações:**

- Colaborador
- Cargo
- Departamento
- Subdepartamento
- Responsável direto
- Nível hierárquico
- Colaboradores subordinados
- Cadeia de reporte

**Exemplo:**

```
Diretor de RH → Chefe de Formação → Coordenador → Técnico → Assistente
```

**Também pode mostrar:** N.º de subordinados diretos, N.º de subordinados indiretos, Linha de reporte, Substituto, Estado da relação hierárquica

## 8. Histórico

Registo das alterações feitas à estrutura do departamento.

**Informações:**

- Data
- Hora
- Tipo de alteração
- Informação alterada
- Valor anterior
- Novo valor
- Utilizador que alterou
- Motivo
- Observação

**Exemplos de eventos:** Departamento criado, Nome alterado, Responsável alterado, Departamento transferido, Subdepartamento criado, Colaborador transferido, Cargo adicionado, Departamento desativado, Departamento reativado

## 9. Relatórios

**Relatórios:**

- Headcount por departamento
- Headcount por unidade
- Headcount por cargo
- Headcount previsto vs. atual
- Distribuição de colaboradores
- Estrutura hierárquica
- Cargos ocupados vs. vagas
- Rotatividade
- Admissões
- Saídas
- Antiguidade
- Formação por departamento
- Horas de formação
- Participação em formações
- Avaliações de desempenho
- Competências
- PDI
- Férias/licenças
- Ausências
- Indicadores de desempenho
- Custos de pessoal
- Orçamento departamental

**Filtros dos relatórios:** Período, Unidade, Departamento, Subdepartamento, Cargo, Localização, Estado do colaborador

## Distinção proposta na INNOVA

| Aba | Principal objetivo |
|---|---|
| Visão Geral | Resumo e KPIs |
| Departamentos | Gestão da lista de departamentos |
| Estrutura Organizacional | Organograma/estrutura |
| Responsáveis | Lideranças dos departamentos |
| Colaboradores | Pessoas alocadas |
| Cargos & Funções | Estrutura de posições |
| Hierarquia | Relações de reporte |
| Histórico | Auditoria das alterações |
| Relatórios | Análise e exportação |
