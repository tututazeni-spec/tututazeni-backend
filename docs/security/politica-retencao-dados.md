# Política de retenção, exportação e eliminação de dados (LPDP)

Lei n.º 22/11 (Lei da Protecção de Dados Pessoais de Angola). Os prazos abaixo são o **estado implementado** e propostas a **validar com o DPO/jurídico** antes de produção.

## Direitos do titular (como estão implementados)
| Direito | Como | Onde |
|---|---|---|
| Acesso / portabilidade | `GET /settings/privacy/me/export` (próprio) ou `POST /settings/privacy/requests/:id/execute` (ADMIN); JSON `innova-personal-data/v1` | `src/settings/personal-data.service.ts` |
| Eliminação | Anonimização (`execute` num pedido `ERASURE`, ou automática com `autoDeleteOnRequest`). Irreversível; encerra sessões | idem |
| Pedido do titular | `POST /settings/privacy/me/requests` (autoatendimento) ou registo por ADMIN | `settings.controller.ts` |
| Rectificação / oposição | Registados como pedido e tratados manualmente | `DataSubjectRequest` |

Tudo respeita `exportEnabled` / `anonymizationEnabled` (Definições → Privacidade) e fica na cadeia de auditoria (`PRIVACY_*`).

## Retenção por tipo de dado
| Dado | Prazo | Mecanismo |
|---|---|---|
| Notificações (`NotificationLog`) | `retentionDays` (omissão 1825 d) | Cron diário 03:40 (`privacy-retention.service.ts`) |
| Refresh tokens expirados/revogados | 30 d após expirar/revogar | idem |
| Execuções de automação / dead letters / auditoria de automação | 365 / 180 / 730 d (configurável) | `automation-retention.service.ts` |
| Transcrições Avatar Training | `AVATAR_TRAINING_RETENTION_DAYS` (365 d) | `avatar-training-retention.service.ts` |
| Logs de auditoria | `retentionUntil` por categoria (Definições → Auditoria) | `purgeAuditLogs` (único modo de apagar; append-only por trigger) |
| Recibos de vencimento, folha | **Não apagados**; propor ≥ 10 anos (obrigação fiscal/laboral) — validar | — |
| Presenças, licenças | **Não apagados**; propor duração do vínculo + 5 anos — validar | — |
| Dados do utilizador após saída | Mantidos até pedido de eliminação; propor anonimizar 5 anos após `exitDate` — **não automatizado** | `anonymizeUser` |

Na anonimização mantêm-se recibos, presenças e auditoria (retenção legal), mas a pessoa deixa de ser identificável (nome, email, contactos, NIF/NIB, perfil e tokens removidos).

## Backups e recuperação
- RPO/RTO: ≤ 24 h / ≤ 4 h (falha total), PITR ≈ 5 min dentro de 7 dias — `ops/dr/DISASTER-RECOVERY.md`. O RTO só é número real após o primeiro drill.
- Teste de restauro: `ops/backup/restore-drill.sh`, cron mensal (dia 1, 05:00) via `ops/backup/install-cron.sh`. **Pendente:** correr uma vez à mão e registar o tempo medido.
- Atenção: um backup contém dados já eliminados. Após restauro, voltar a aplicar os pedidos de eliminação posteriores ao backup (consultar `data_subject_requests` com `ERASURE` concluídos).
