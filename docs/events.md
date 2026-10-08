# Módulo Events

Módulo de gestão de eventos corporativos, separado do Trainings.

O Events trata de eventos internos e corporativos; o Trainings trata especificamente da gestão das formações da Academia.

## Estrutura do módulo Events

Visão Geral, Eventos, Calendário, Participantes, Programação, Locais & Logística, Oradores & Convidados, Comunicação, Check-in & Presença, Avaliação, Relatórios

## 1. Visão Geral

Dashboard dos eventos.

**Informações:**

- Total de eventos
- Eventos próximos
- Eventos em curso
- Eventos concluídos
- Eventos cancelados
- Eventos por tipo
- Participantes inscritos
- Participantes confirmados
- Taxa de participação
- Eventos por unidade
- Eventos por departamento
- Próximos eventos
- Inscrições pendentes
- Check-ins realizados
- Avaliações pendentes

## 2. Eventos

Lista e gestão dos eventos.

**Informações:**

- Nome do evento
- Código
- Tipo
- Descrição
- Objetivo
- Organizador
- Unidade
- Departamento
- Data de início
- Data de fim
- Hora de início
- Hora de fim
- Local
- Capacidade
- Número de inscritos
- Número de confirmados
- Estado
- Visibilidade
- Responsável
- Data de criação

**Tipos de evento:** Evento corporativo, conferência, seminário, workshop, palestra, reunião, celebração, cerimónia, campanha interna, feira, congresso, team building, evento institucional, evento externo, outro

**Estados:** Rascunho, Agendado, Inscrições abertas, Inscrições encerradas, Em curso, Concluído, Cancelado

### Ao clicar em "Novo Evento"

**Informações gerais:** Nome, código, descrição, objetivo, tipo, categoria, organizador, responsável, unidade, departamento

**Data & horário:** Data de início, data de fim, hora de início, hora de fim, fuso horário

**Local:** Presencial, online ou híbrido, local, endereço, sala, capacidade, link da reunião

**Inscrições:** Inscrição obrigatória, período de inscrição, limite de participantes, lista de espera, aprovação de inscrição, público-alvo, departamentos elegíveis

**Configurações:** Evento público/interno, visibilidade, permitir acompanhante, certificado, avaliação, check-in, notificações

## 3. Calendário

Calendário central de eventos.

**Informações:** Evento, data, hora, duração, local, responsável, tipo, estado, participantes

**Visualizações:** Mês, semana, dia, agenda

**Filtros:** Unidade, departamento, tipo, responsável, local, estado

Também deve permitir clicar no evento e abrir os detalhes.

## 4. Participantes

Gestão das inscrições.

**Informações:**

- Colaborador
- Nº de colaborador
- Cargo
- Departamento
- Unidade
- Inscrição
- Data da inscrição
- Estado da inscrição
- Confirmação
- Data de confirmação
- Presença
- Check-in
- Check-out
- Certificado
- Avaliação

**Estados da inscrição:** Inscrito, Pendente, Confirmado, Lista de espera, Rejeitado, Cancelado

**Ações:** Adicionar participante, aprovar, rejeitar, confirmar, cancelar inscrição, importar participantes, exportar lista

## 5. Programação

Para eventos que possuem várias atividades.

**Informações:** Evento, sessão/atividade, título, descrição, data, hora de início, hora de fim, duração, local, sala, responsável, orador, capacidade, estado

**Exemplo:**

```
09:00 — Abertura
09:30 — Apresentação institucional
10:30 — Painel de discussão
12:00 — Networking
```

## 6. Locais & Logística

Gestão dos recursos necessários para realizar o evento.

**Informações:** Local, sala, capacidade, endereço, responsável, equipamentos, recursos necessários, fornecedores, catering, transporte, alojamento, segurança, decoração, orçamento, custo estimado, custo realizado, estado

**Recursos:** Projetor, ecrã, sistema de som, microfones, cadeiras, mesas, computadores, internet, materiais, sinalização

## 7. Oradores & Convidados

Gestão das pessoas que participam como oradores, convidados ou moderadores.

**Informações:** Nome, tipo, organização, cargo, contacto, biografia, fotografia, tema, sessão, horário, necessidades especiais, honorários, transporte, alojamento, estado

**Tipos:** Orador, palestrante, moderador, convidado, painelista, facilitador, representante institucional

## 8. Comunicação

Gestão das comunicações relacionadas com o evento.

**Informações:** Evento, destinatários, tipo de comunicação, assunto, mensagem, data de envio, estado, canal

**Comunicações:** Convite, confirmação, lembrete, alteração de horário, alteração de local, cancelamento, instruções, agradecimento, follow-up

**Canais:** Notificação INNOVA, e-mail, SMS, WhatsApp — conforme as integrações disponíveis

## 9. Check-in & Presença

Controlar quem realmente participou no evento.

**Informações:** Participante, evento, data, hora de entrada, hora de saída, duração, método de check-in, estado, observação

**Métodos:** QR Code, aplicação móvel, código, registo manual

**Estados:** Presente, Ausente, Entrada registada, Saída registada

Se o evento tiver sessões, também pode controlar: presença por sessão, hora de entrada por sessão, hora de saída por sessão, duração da participação.

> O Events não deve herdar automaticamente regras de assiduidade de formação.

## 10. Avaliação

Avalia a experiência dos participantes.

**Informações:** Evento, participante, data, avaliação geral, organização, conteúdo, local, oradores, logística, comunicação, recomendação, comentário, estado

**Usar:** Escala de 1–5, NPS, perguntas abertas

**Medir:** Satisfação geral, satisfação com o conteúdo, satisfação com o local, satisfação com a organização, intenção de participar novamente

## 11. Relatórios

**Relatórios:** Eventos por período, eventos por unidade, eventos por departamento, participantes por evento, taxa de inscrição, taxa de confirmação, taxa de participação, ausências, check-ins, participação por sessão, eventos presenciais/online/híbridos, custos por evento, orçamento vs. custo real, satisfação dos participantes, avaliação dos oradores, NPS do evento

**Filtros:** Período, evento, tipo, unidade, departamento, local, responsável, estado

## Integrações

O Events deve conversar com os restantes módulos, mas não duplicar funcionalidades.

- **Users** → participantes e organizadores
- **Organization** → empresas e unidades
- **Departments** → departamentos participantes
- **Calendar** → agenda
- **Notifications** → convites e lembretes
- **Library** → materiais/documentos do evento
- **Trainings** → quando um evento estiver associado a uma formação
- **Courses** → quando houver conteúdo formativo
- **Attendance** → somente quando fizer sentido integrar presença corporativa
- **Reports/Analytics** → indicadores e análise
