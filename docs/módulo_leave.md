# Módulo Leave

Centro de gestão de ausências, férias e licenças dos colaboradores.

Manter pedido e aprovação separados: `LeaveRequest → LeaveApproval` — não juntar os dois modelos.

## Abas principais

Visão Geral, Férias & Licenças, Pedidos, Aprovações, Calendário, Saldo de Férias, Ausências, Tipos de Licença, Equipas, Relatórios, Configurações

## 1. Visão Geral

**Cards:** Colaboradores ausentes hoje, Férias hoje, Licenças hoje, Pedidos pendentes, Pedidos aprovados, Próximas ausências, Saldo médio de férias

**Também:** Calendário de ausências, Ausências por departamento, Ausências por unidade, Pedidos por tipo

## 2. Férias & Licenças

**Tabela:**

- Colaborador
- Departamento
- Unidade
- Tipo
- Data de início
- Data de fim
- Nº de dias
- Estado
- Substituto
- Aprovador
- Data do pedido
- Ações

**Tipos:** Férias, Licença, Falta justificada, Ausência autorizada, Dispensa, licença de maternidade, licença de paternidade, luto, ausência justificada, baixa médica, Dever cívico, formação, Licença sem vencimento, Outro

## 3. Pedidos

Pedidos feitos pelos colaboradores.

**Campos:** Nº do pedido, Colaborador, Tipo, Data de início, Data de fim, Dias, Motivo, Estado, Data do pedido, Aprovador, Ações

**Estados:** Rascunho, Pendente, Em aprovação, Aprovado, Rejeitado, Cancelado, Em curso, Concluído

**Ações:** Ver, Editar, Cancelar, Aprovar, Rejeitar, Solicitar alteração

## 4. Ao clicar em "Novo Pedido de Ausências"

### Dados do pedido

Colaborador, Tipo de ausência, Data de início, Data de fim, Número de dias, Meio dia, Motivo, Observações

### Substituição

Substituto, Responsabilidades delegadas, Observações para o substituto

### Documentação

Quando aplicável: Documento comprovativo, Anexo, Data do documento

### Aprovação

Aprovador, Fluxo de aprovação, Observações

O sistema deve calcular automaticamente: Dias úteis, Fins de semana, Feriados, Dias descontados do saldo

## 5. Aprovações

Parte que o gestor/RH utiliza para decidir os pedidos.

**Tabela:** Pedido, Colaborador, Tipo, Período, Dias, Saldo disponível, Gestor, Estado, Data, Ações

**Ao abrir:** Resumo do pedido, Saldo atual, Histórico de férias, Conflitos de equipa, Documentos, Comentários

**Ações:** Aprovar, Rejeitar, Solicitar alteração

Se rejeitar: **motivo da rejeição obrigatório.**

## 6. Calendário

**Visualização:** Mês, Semana, Lista

**Mostrar:** Férias, Licenças, Ausências, Feriados

**Filtros:** Unidade, Departamento, Equipa, Tipo de ausência, Colaborador, Estado

Para o gestor: ver quem estará ausente durante determinado período.

## 7. Saldo de Férias

**Por colaborador:**

- Ano
- Dias atribuídos
- Dias transitados
- Dias utilizados
- Dias aprovados
- Dias pendentes
- Dias disponíveis
- Dias expirados

**Exemplo:**

```
Direito anual: 22 dias
Transitados:    3
Utilizados:     8
Aprovados:      5
Disponíveis:   12
```

O saldo deve ser atualizado automaticamente quando um pedido é aprovado/cancelado.

## 8. Ausências

Separar ausência de pedido de férias/licença.

**Registar:** Colaborador, Data, Tipo, Duração, Motivo, Justificação, Documento, Estado, Origem

**Tipos:** Falta injustificada, Falta justificada, Ausência autorizada, Dispensa, Doença, Acidente de trabalho, Outro

## 9. Tipos de Licença

O administrador/RH configura os tipos disponíveis.

**Campos:** Nome, Código, Categoria, Descrição, Remunerada, Não remunerada, Requer documento, Requer aprovação, Limite de dias, Elegibilidade, Estado

**Exemplos:** Licença parental, Licença de maternidade, Licença de paternidade, Licença sem vencimento, Licença por falecimento, Licença por casamento, Licença para assistência familiar

As regras legais específicas devem ser parametrizáveis, em vez de ficarem codificadas diretamente no frontend.

## 10. Equipas

**Para gestores:** Equipa, Colaboradores, Ausentes hoje, Próximas férias, Pedidos pendentes, Cobertura da equipa

**Também pode mostrar:** Calendário da equipa

## 11. Relatórios

Férias utilizadas, Férias disponíveis, Férias por departamento, Férias por unidade, Licenças por tipo, Ausências, Taxa de absentismo, Dias de ausência, Pedidos aprovados, Pedidos rejeitados, Pedidos pendentes, Saldo de férias, Colaboradores com férias acumuladas

**Exportação:** Excel, PDF, CSV

## 12. Configurações

Ano de férias, Direito anual, Dias transitados, Validade dos dias, Feriados, Tipos de ausência, Tipos de licença, Regras de elegibilidade, Regras de cálculo, Fluxos de aprovação, Aprovadores, Substitutos, Notificações, Permissões

## Fluxo a usar

```
COLABORADOR
    │
    ▼
Novo pedido
    │
    ▼
LeaveRequest
    │
    ▼
Validação automática
    │
    ├── Saldo disponível?
    ├── Datas válidas?
    ├── Conflito?
    └── Documentação necessária?
    │
    ▼
LeaveApproval
    │
    ├── Gestor
    └── RH (quando necessário)
    │
    ▼
APROVADO
    │
    ├── Atualiza saldo
    ├── Atualiza calendário
    ├── Notifica colaborador
    └── Integra com Attendance
```

## Estrutura de dados separada

- **LeaveRequest** = o pedido feito
- **LeaveApproval** = decisão/revisão do pedido
- **LeaveBalance** = saldo/direito
- **LeaveType** = tipo de ausência/licença
- **LeavePeriod** = período efetivamente aprovado
