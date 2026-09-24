# Payroll — Processamento Salarial

Integrar payroll + payslips num único módulo.

## Estrutura do módulo

Visão Geral, Processamentos, Colaboradores, Remunerações, Deduções & Impostos, Recibos de Vencimento, Pagamentos, Fecho Salarial, Relatórios

## 1. Visão Geral

Dashboard do processamento salarial.

**Informações:**

- Mês de processamento
- Período
- Estado da folha
- Total de colaboradores
- Colaboradores processados
- Colaboradores pendentes
- Salário bruto total
- Salário líquido total
- Total de remunerações
- Total de deduções
- Total de INSS
- Total de IRT
- Encargos patronais
- Custo total com pessoal
- Total a pagar
- Processamento anterior
- Variação mensal
- Pagamentos pendentes
- Recibos emitidos
- Recibos pendentes
- Alertas

## 2. Processamentos

Gestão de cada folha salarial mensal.

**Informações:**

- Período
- Mês
- Ano
- Unidade
- Departamento
- Número de colaboradores
- Total bruto
- Total de deduções
- Total líquido
- INSS trabalhador
- INSS empregador
- IRT
- Outros descontos
- Custo patronal
- Total da folha
- Estado
- Criado por
- Data de criação
- Processado por
- Data de processamento
- Fechado por
- Data de fecho

**Estados:** Rascunho, Em preparação, Em processamento, Processado, Em validação, Aprovado, Fechado, Pago, Cancelado

### Ao clicar em "Novo Processamento"

Período, mês, ano, unidade, colaboradores abrangidos, incluir novos colaboradores, incluir ausências, incluir horas extra, incluir subsídios, incluir prémios, incluir bónus, aplicar deduções, calcular INSS, calcular IRT, aplicar faltas, aplicar descontos, data prevista de pagamento, observações

## 3. Colaboradores

Situação salarial de cada colaborador dentro do processamento.

**Informações:**

- Colaborador
- Nº de colaborador
- NIF
- Departamento
- Cargo
- Salário base
- Remunerações
- Subsídios
- Horas extra
- Prémios
- Bónus
- Faltas
- Descontos
- INSS
- IRT
- Outras deduções
- Salário bruto
- Salário líquido
- Custo patronal
- Estado do processamento

**Ao abrir o colaborador:** Dados contratuais, remuneração base, componentes salariais, benefícios, deduções, impostos, histórico salarial, recibos de vencimento, pagamentos

## 4. Remunerações

Gestão das componentes que aumentam o vencimento.

**Informações:**

- Tipo
- Nome
- Código
- Descrição
- Valor
- Percentagem
- Periodicidade
- Tributável
- Sujeito a INSS
- Sujeito a IRT
- Recorrente
- Aplicável a colaboradores
- Data de início
- Data de fim
- Estado

**Exemplos:** Salário base, subsídio de alimentação, subsídio de transporte, subsídio de férias, subsídio de Natal, horas extraordinárias, prémios, bónus, comissões, ajudas de custo, outros abonos

## 5. Deduções & Impostos

Valores retidos ou descontados.

**Informações:**

- Tipo de dedução
- Código
- Descrição
- Base de cálculo
- Percentagem
- Valor
- Colaborador
- Período
- Recorrente
- Obrigatório
- Estado

### INSS

Base contributiva, taxa do trabalhador, contribuição do trabalhador, taxa patronal, contribuição patronal

### IRT

Rendimento tributável, deduções aplicáveis, matéria coletável, escalão, imposto calculado, isenção aplicável, IRT retido

### Outras deduções

Empréstimos, adiantamentos salariais, faltas, descontos autorizados, pensões, outros descontos

As regras fiscais/contributivas devem ser configuráveis por período, para que alterações legais futuras não exijam alterar o código do módulo.

## 6. Recibos de Vencimento

Aqui fica tudo o que anteriormente pertencia ao Payslips.

**Informações:**

- Número do recibo
- Colaborador
- Período
- Salário base
- Remunerações
- Subsídios
- Prémios
- Horas extra
- Salário bruto
- INSS
- IRT
- Outras deduções
- Total de deduções
- Salário líquido
- Custo patronal
- Estado
- Data de emissão
- Data de disponibilização

**Ações:** Visualizar, descarregar PDF, imprimir, enviar ao colaborador, reenviar, bloquear, consultar histórico

**No recibo, deve apresentar:** Dados da empresa, logótipo, dados do colaborador, NIF, número de colaborador, departamento, cargo, período, remunerações, descontos, INSS, IRT, líquido a receber, dados bancários (quando aplicável), informação adicional, assinatura/validação digital

O colaborador pode consultar os seus recibos através do seu perfil.

## 7. Pagamentos

Controla a passagem da folha processada para o pagamento.

**Informações:**

- Processamento
- Período
- Banco
- Conta de pagamento
- Número de colaboradores
- Valor total
- Data prevista
- Data efetiva
- Estado
- Referência de pagamento
- Ficheiro bancário
- Responsável

**Estados:** Pendente, Preparado, Enviado ao banco, Processado, Pago, Falhou, Cancelado

**Pode permitir:** Exportar ficheiro bancário, exportar lista de pagamentos, marcar como pago, consultar erros

## 8. Fecho Salarial

Controla o encerramento definitivo da folha.

**Informações:**

- Período
- Processamento
- Validação RH
- Validação financeira
- Aprovação
- Total de colaboradores
- Total bruto
- Total líquido
- Total de impostos
- Total de encargos
- Recibos emitidos
- Pagamentos processados
- Data de fecho
- Fechado por

**Checklist:** Colaboradores processados, remunerações verificadas, deduções verificadas, INSS calculado, IRT calculado, recibos emitidos, folha aprovada, pagamentos preparados, pagamentos concluídos

Depois de Fechado, o processamento deve ficar protegido contra alterações normais.

## 9. Relatórios

**Relatórios:**

- Folha salarial mensal
- Custo salarial
- Salários brutos
- Salários líquidos
- Remunerações
- Deduções
- INSS
- IRT
- Encargos patronais
- Custo total com pessoal
- Salários por departamento
- Salários por unidade
- Salários por cargo
- Evolução mensal
- Variação salarial
- Horas extra
- Prémios e bónus
- Subsídios
- Faltas com impacto salarial
- Pagamentos
- Recibos emitidos
- Recibos pendentes

**Filtros:** Período, ano, mês, unidade, departamento, cargo, colaborador, tipo de remuneração, tipo de dedução, estado

## Integrações

O novo Payroll deve receber dados de outros módulos, mas não duplicá-los.

- **Users** → dados do colaborador, cargo, NIF, NIB/IBAN, departamento, cargo
- **Departments** → estrutura organizacional
- **Leave** → férias/licenças com impacto salarial
- **Notifications** → aviso de recibo disponível

## O que acontece ao Payslips?

- Payroll ✅ manter
- Payslips ❌ remover como módulo independente

Mas não remover o modelo `Payslip` do Prisma/schema.

### Arquitetura

```
Payroll
├── Processamentos
├── Colaboradores
├── Remunerações
├── Deduções & Impostos
├── Recibos de Vencimento
├── Pagamentos
├── Fecho Salarial
└── Relatórios
```

### No backend

```
src/payroll/
├── payroll.controller.ts
├── payroll.service.ts
├── payroll.module.ts
├── payslip/
├── remuneration/
├── deductions/
├── taxes/
├── payments/
└── reports/
```
