# Módulo History

O módulo deve ser o histórico transversal de alterações e acontecimentos relevantes, mas não substituir o Audit Logs técnico.

## Abas principais

Visão Geral, Histórico, Histórico do Colaborador, Movimentos, Alterações Organizacionais, Documentos & Registos, Actividades, Relatórios

## 1. Visão Geral

Dashboard do histórico da organização.

**Informações:**

- Total de eventos
- Alterações hoje
- Alterações este mês
- Admissões
- Transferências
- Alterações de cargo
- Alterações de departamento
- Alterações salariais
- Avaliações concluídas
- Formações concluídas
- Documentos adicionados
- Pedidos aprovados
- Pedidos rejeitados
- Últimas actividades
- Utilizadores mais activos
- Módulos com mais alterações

## 2. Histórico

Linha cronológica central da INNOVA.

**Informações:**

- Data
- Hora
- Utilizador
- Colaborador afectado
- Módulo
- Entidade
- Tipo de evento
- Descrição
- Estado
- Referência
- Origem

**Tipos de eventos:** Criado, actualizado, eliminado, aprovado, rejeitado, concluído, cancelado, transferido, promovido, alterado, atribuído, desactivado, reactivado, submetido, arquivado

**Exemplo:**

> 22/09/2026 — 10:32
> João Silva foi transferido do Departamento Comercial para Logística.
> Alterado por: Maria Costa.

## 3. Histórico do Colaborador

Ao abrir um colaborador, apresenta-se uma timeline completa da sua vida na organização.

**Informações:** Admissão, departamento, cargo, transferências, promoções, alterações de função, alterações de responsável, formações, avaliações, competências, PDI, férias/licenças, documentos, prémios, alterações salariais, movimentos relevantes

**Exemplo:**

```
2026
│
├── Set — Promoção para Coordenador
├── Ago — Conclusão de Formação de Liderança
├── Jul — Avaliação de Desempenho concluída
├── Jun — Transferência para Logística
└── Jan — Admissão
```

Esta informação deve ser alimentada pelos módulos correspondentes, não duplicada manualmente.

## 4. Movimentos

Principais alterações na situação profissional.

**Informações:**

- Colaborador
- Tipo de movimento
- Data
- Cargo anterior
- Cargo novo
- Departamento anterior
- Departamento novo
- Unidade anterior
- Unidade nova
- Responsável anterior
- Responsável novo
- Motivo
- Aprovado por
- Observação

**Tipos:** Admissão, transferência, promoção, alteração de cargo, alteração de departamento, alteração de unidade, mudança de responsável, alteração contratual, saída, reactivação

## 5. Alterações Organizacionais

Histórico da estrutura da empresa.

**Informações:** Data, organização, unidade, departamento, alteração, valor anterior, novo valor, responsável, motivo

**Exemplos:** Departamento criado, departamento renomeado, departamento extinto, unidade criada, unidade encerrada, responsável alterado, departamento transferido para outra unidade

## 6. Documentos & Registos

Histórico dos principais documentos e registos.

**Informações:** Documento, colaborador/entidade, tipo, acção, versão, data, utilizador, estado

**Exemplos:** Documento criado, documento actualizado, documento validado, documento rejeitado, documento expirado, documento arquivado

O ficheiro em si continua no Document Repository/Biblioteca.

## 7. Actividades

Actividades relevantes realizadas dentro da plataforma.

**Informações:** Utilizador, módulo, acção, entidade, data, hora, estado, descrição

**Exemplos:** Criou avaliação, aprovou férias, concluiu formação, criou PDI, publicou curso, aprovou documento, encerrou processamento salarial

## 8. Filtros

Não é uma página separada — é uma barra de filtros global.

**Filtros:** Período, colaborador, utilizador, módulo, entidade, departamento, unidade, tipo de evento, estado, responsável

**Também:** Hoje, últimos 7 dias, este mês, último mês, este ano, intervalo personalizado

## 9. Relatórios

**Relatórios:** Histórico de colaboradores, movimentos de colaboradores, admissões, saídas, transferências, promoções, alterações de cargos, alterações de departamentos, alterações organizacionais, actividades por módulo, actividades por utilizador, alterações por período

**Exportação:** Excel, CSV, PDF

## Integração com os outros módulos

O History deve funcionar como uma timeline transversal:

- **Users** → admissão/alteração de dados
- **Departments** → transferência/alteração organizacional
- **Positions** → alteração de cargo
- **Leave** → férias/licenças
- **Attendance** → ocorrências de assiduidade
- **Payroll** → alterações salariais/processamentos
- **Competencies** → avaliações/evolução
- **Evaluation** → avaliações concluídas
- **Evaluation 360°** → ciclos/resultados
- **Training** → formações concluídas
- **Onboarding** → integração
- **Development Plans** → PDI
- **Career** → progressão profissional
- **Documents** → alterações documentais
