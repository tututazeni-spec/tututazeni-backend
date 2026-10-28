# Primeiras 48–72 horas — escala e cobertura de lançamento

> Complementa `gestao-incidentes.md` (papéis e severidades), `alerting.md` (para onde vão os alertas) e `docs/suporte/canais-e-base-de-conhecimento.md` (tempos de resposta do suporte).
> Nas primeiras 72 h após o go-live os problemas aparecem aos montes e os utilizadores ainda não sabem o que é normal. Este documento garante que, a qualquer hora, **toda a equipa sabe quem está disponível e o que lhe cabe**.

## 1. Escala (preencher antes do go-live)

> ⚠️ Os nomes e contactos **não estão no repositório por privacidade**: a tabela real fica no canal fixado da equipa (ou cofre partilhado) e é copiada aqui só como modelo. Cada linha tem de ter uma pessoa **e** um suplente. Linha vazia = go-live não aprovado.

Fuso de referência: Luanda (WAT, UTC+1). Janelas de 8 h para ninguém passar mais de uma noite seguida em alerta.

| Janela | Papel | Pessoa | Suplente | Contacto primário | Contacto secundário |
|---|---|---|---|---|---|
| Dia 1 · 08:00–16:00 | IC / Operador / Comunicação / Suporte | _preencher_ | _preencher_ | telefone | Telegram |
| Dia 1 · 16:00–24:00 | idem | _preencher_ | _preencher_ | | |
| Dia 1 · 00:00–08:00 | Piquete (alerta SEV1 acorda) | _preencher_ | _preencher_ | | |
| Dia 2 · 08:00–16:00 | idem | | | | |
| Dia 2 · 16:00–24:00 | idem | | | | |
| Dia 2 · 00:00–08:00 | Piquete | | | | |
| Dia 3 · 08:00–16:00 | idem | | | | |
| Dia 3 · 16:00–24:00 | idem | | | | |
| Escalamento (engenharia) | Responsável técnico | _preencher_ | _preencher_ | | |
| Privacidade / dados pessoais | Responsável de privacidade | _preencher_ | _preencher_ | | |
| Cliente (comercial) | Quem fala com o cliente | _preencher_ | _preencher_ | | |

Regras da escala:

1. **Piquete a pé**, não "disponível se possível": atende o telefone em ≤ 15 min (SEV1). Quem tem a janela de noite descansa no dia anterior.
2. **Sem pontos únicos de falha humanos:** nenhuma pessoa cobre duas janelas seguidas de piquete, e quem fez o deploy final não é o único com acesso ao VPS (acessos verificados na secção 3).
3. **Troca de turno por escrito** (secção 4) — nada de "passei-lhe de voz".
4. Qualquer troca na escala é publicada no canal da equipa **antes** de acontecer, com o suplente a confirmar.

## 2. Onde a equipa é informada

| O quê | Como | Quem garante |
|---|---|---|
| A escala completa (esta tabela) | Mensagem fixada no canal da equipa **e** enviada por e-mail a todos 24 h antes do go-live | Responsável técnico |
| Quem é o IC do momento | Primeira linha do canal da equipa, actualizada em cada troca de turno | IC cessante |
| Alertas críticos | Telegram + e-mail (+ SMS/Slack se configurados) para o piquete — destinatários em `alerting.md` | Operador |
| Estado ao cliente | Página de estado (`status-page.md`) | Comunicação |
| Pedidos de suporte | Fila *Ajuda e Suporte* (ADMIN e RH), 1 h para CRÍTICA em horário útil | Suporte |

> Os tempos prometidos ao cliente fora do horário útil (seg–sex 08:00–18:00) **não mudam** por haver escala de lançamento: o piquete cobre alertas e incidentes SEV1, não passa a responder a pedidos normais à noite. Se quisermos prometer mais durante o lançamento, comunica-se ao cliente e actualiza-se `src/support/support.sla.ts` e `sla-contratual.md`.

## 3. Verificação na véspera (T-24 h)

Quem estiver na escala confirma, em ordem, e assinala no canal:

- [ ] Todos recebem um alerta de teste (Telegram **e** e-mail; SMS se activo) — `alerting.md` secção de teste
- [ ] Todos os operadores conseguem entrar por SSH no VPS (`deploy@`) e ver `docker compose ps`
- [ ] Todos sabem onde está o `runbook.md`, `disaster-recovery.md` e o comando de rollback (`ops/deploy/rollback-drill.sh` foi ensaiado)
- [ ] Os papéis ADMIN/RH do suporte conseguem abrir a fila de pedidos
- [ ] `SUPPORT_EMAIL` e `STATUS_PAGE_URL` definidos e a caixa de suporte monitorizada
- [ ] Segredos críticos (`PII_ENCRYPTION_KEY`, `PASSWORD_PEPPER`, `BACKUP_ENCRYPT_PASSPHRASE`) no cofre, com pelo menos duas pessoas com acesso
- [ ] `npm run preflight:golive` sem `FALHA`
- [ ] Contacto do fornecedor de Postgres gerido, Cloudflare e DNS à mão (número de conta/projecto)

## 4. Ritmo das 72 horas

| Quando | Acção | Dono |
|---|---|---|
| **H+0 → H+2** | Equipa toda online. Acompanhar logins, erros 5xx, latência p95 e filas em tempo real; só depois se sai do modo "atenção total" | Operador + IC |
| **H+2, H+6, H+12, H+24, H+48, H+72** | Ponto de situação de 5 min: erros, pedidos de suporte abertos, backups, espaço em disco, alertas disparados, algo a mudar na escala | IC |
| **Cada manhã (09:00)** | Revisão dos pedidos de suporte da noite e dos pedidos mais repetidos → artigo na base de conhecimento ou FAQ se for dúvida repetida | Suporte |
| **Cada troca de turno** | Nota escrita: incidentes abertos, o que está em observação, mudanças feitas, o que o próximo turno deve vigiar | IC cessante → IC entrante |
| **Congelamento** | Sem deploys de funcionalidades nas 72 h; só correcções de SEV1/SEV2, com aprovação do IC e rollback pronto | IC |
| **H+72** | Reunião de encerramento: incidentes, pedidos de suporte por categoria, tempos de primeira resposta cumpridos (`GET /support/tickets/summary`), decisão de voltar ao regime normal de piquete | Responsável técnico |

## 5. Critério para sair do regime de lançamento

Voltar ao regime normal só quando, nas últimas 24 h: **0 incidentes SEV1**, sem SEV2 aberto, taxa de 5xx < 1 %, todos os pedidos CRÍTICOS respondidos dentro de 1 h útil e nenhuma tarefa agendada ou fila com alerta. Caso contrário, prolonga-se a escala por mais 24 h e regista-se o motivo.
