# Política de retenção, exportação e eliminação de dados (LPDP)

Lei n.º 22/11, de 17 de Junho (Lei da Protecção de Dados Pessoais de Angola). Estado implementado + decisões tomadas em 2026-10-27 com base no texto da lei (ver "Fundamento legal"). Os prazos de recibos/presenças **não** vêm de um artigo que tenha sido possível confirmar — ver "Limites da verificação".

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
| Recibos de vencimento, folha | **Nunca apagados pelo sistema** (opção conservadora: o sistema não tem prazo legal confirmado para os eliminar). Ficam associados ao titular anonimizado | — |
| Presenças, licenças | **Nunca apagados pelo sistema**; ficam associados ao titular anonimizado | — |
| Dados do utilizador após saída | Anonimizados automaticamente `exitRetentionYears` (omissão **5**, 0 desactiva) após `exitDate`, até 100 por execução | Cron diário (`privacy-retention.service.ts`); configurável em Definições → Privacidade |

Na anonimização mantêm-se recibos, presenças e auditoria (retenção legal), mas a pessoa deixa de ser identificável (nome, email, contactos, NIF/NIB, perfil e tokens removidos).

## Backups e recuperação
- RPO/RTO: ≤ 24 h / ≤ 4 h (falha total), PITR ≈ 5 min dentro de 7 dias — `ops/dr/DISASTER-RECOVERY.md`. O RTO só é número real após o primeiro drill.
- Teste de restauro: `ops/backup/restore-drill.sh`, cron mensal (dia 1, 05:00) via `ops/backup/install-cron.sh`. **Pendente:** correr uma vez à mão e registar o tempo medido.
- Um backup contém dados já eliminados. Após **qualquer** restauro correr `POST /settings/privacy/erasures/reapply` (ADMIN): volta a anonimizar todos os titulares com pedido `ERASURE` concluído. Idempotente. Está no passo final do runbook de restauro.

## Fundamento legal e decisões
- **Conservação limitada à finalidade** (Lei 22/11, princípio da conservação — citado como art. 11.º no texto consolidado): os dados só devem identificar o titular pelo tempo necessário à finalidade; depois, eliminar ou anonimizar. É o que justifica a anonimização de ex-colaboradores e a purga de notificações/tokens. Fonte: [lex.ao](https://lex.ao/docs/assembleia-nacional/2011/lei-n-o-22-11-de-17-de-junho/), [angolex](https://www.angolex.com/paginas/leis/lei-de-protecao-de-dados-pessoais.html).
- **Direitos do titular**: informação, acesso, rectificação, cancelamento (eliminação) e oposição — todos têm caminho (pedido do titular + execução). Fonte: angolex (art. 6.º, n.º 2).
- **Portabilidade**: a lei angolana não a prevê expressamente (ao contrário do RGPD; ver [Julgar, 2026](https://julgar.pt/wp-content/uploads/2026/02/A-trajectoria-da-agencia-de-proteccao-de-dados-de-angola.pdf)). O export JSON vai além do exigido, por isso o formato é livre; mantém-se JSON legível por máquina.
- **Recibos e presenças**: decisão de design = nunca apagar automaticamente e anonimizar apenas a identidade do titular. Isto é seguro seja qual for o prazo legal (fiscal/laboral), porque a retenção legal prevalece sobre o pedido de eliminação.

## Limites da verificação (honestidade)
- Não foi possível confirmar o texto oficial com numeração definitiva de todos os artigos, nem os prazos de conservação de recibos/processo individual na Lei Geral do Trabalho (Lei 12/23) ou no Código Geral Tributário. Nenhum prazo desses está codificado: o sistema simplesmente não os apaga.
- **Obrigações organizacionais que código não resolve** (confirmar com o jurídico/DPO): registo/notificação do tratamento junto da Agência de Protecção de Dados (APD); autorização para transferência internacional de dados — a plataforma usa subprocessadores no estrangeiro (Groq, ElevenLabs, Simli, Twilio, SMTP) e a lei exige autorização/garantias para destinos sem nível de protecção adequado; contratos com subcontratantes; prazo legal de resposta aos pedidos do titular; consentimento (texto versionado já existe em Definições → Privacidade).
