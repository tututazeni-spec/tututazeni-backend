# Módulo de Certificados — Design

Fonte dos requisitos: `docs/prompt_certificados_claude_code.md` (19 secções, critérios de aceitação na §18). Este documento fixa as decisões e o âmbito; o prompt continua a ser a referência de detalhe.

## Intenção
Hoje os certificados não funcionam de ponta a ponta: o botão "Download PDF" não tem acção, `GET /pdf/certificate/:id` devolve dados fictícios sem ownership, a verificação é só um campo dentro da área autenticada (sem página pública nem QR), e não há regras de emissão, aprovação, revogação, reemissão nem gestão de templates. O objetivo é um subsistema único de credenciais, acessível pela aba Certificados de **Cursos** e de **Gestão de Formações**, sobre os mesmos dados.

## Decisões (do utilizador)
- A página pública de verificação mostra o **nome completo** do titular.
- Avançar já para o plano, sem mais perguntas.

## Decisões (minhas — a rever)
- Reutilizar `Certificate` e `CertificateTemplate` (migrações aditivas); `IssuedCertificate` fica legado, sem novas escritas.
- Motor único de PDF em pdfkit + `qrcode` (já instalados). Os 9 templates são configuração visual (layout/cores/molduras) do mesmo motor, não 9 geradores.
- Versionamento: tabela de versões de template; cada certificado guarda `templateVersionId` e um snapshot (JSON) dos dados renderizados, para nunca mudar retroactivamente.
- Verificação pública: rota de frontend sem login + endpoint público que lê o registo actual (estado, validade, revogação) e expõe só o mínimo (§8 do prompt). Código de verificação aleatório (crypto), único.
- Idempotência: unicidade por (titular, atividade, ciclo) na BD + upsert/transação; emissão revalida sempre progresso/nota/presença no servidor.
- Autorização sempre no backend, pelos papéis existentes (ADMIN, RH, GESTOR/LIDER, INSTRUTOR, COLABORADOR; auditor só leitura/export).
- Auditoria via o `AuditService` canónico existente (cadeia de hash partilhada).
- Notificações/alertas de expiração via módulos notifications/automation existentes; reciclagem automática só se o fluxo de inscrições o suportar, senão documentar como pendente.
- LinkedIn: apenas o fluxo oficial "Add to profile" por URL; sem botão se não funcionar. E-mail: só se `mail` estiver configurado.

## Fatias (cada uma entrega valor testável, commits locais BE+FE)
1. **Motor central:** regras de emissão (modelo + avaliação de critérios), serviço de emissão idempotente, PDF real com QR, verificação pública, correcção de `pdf/certificate/:id` e do download.
2. **Templates:** 9 templates seed, versionamento, editor (logótipo, fundo, cores, textos, assinatura, variáveis `{{...}}`, posição), pré-visualização, validação de uploads.
3. **Aba partilhada:** componente único usado em Cursos e Gestão de Formações — visão geral, lista com filtros/paginação, modelos, regras, histórico.
4. **Ciclo de vida:** revogação, reemissão (ligada ao original), importação externa, validade e alertas, emissão em lote.
5. **Colaborador/gestor/exports/testes:** "Os meus certificados", visão de equipa, exportações CSV/Excel/PDF, testes unitários + integração (nota insuficiente, aprovação pendente, duplicado, PDF, verificação, expiração, revogação).

## Fora de âmbito / anti-objetivos
- Sem dados fictícios nem botões sem comportamento real; integrações inexistentes (HRIS, compliance externo) ficam documentadas como pendentes.
- Não alterar decisões de promoção/carreira automaticamente; participar numa avaliação 360° não emite certificados.
- Sem nova dependência de geração de PDF.

## Riscos a ter presentes (CLAUDE.md)
- Divergência schema↔código: confirmar campos em `prisma/schema.prisma` e cobrir com teste de integração real; `prisma migrate dev` não funciona sem TTY (usar migrate diff + migração manual).
- Ownership/IDOR: confirmar `assertCanAccess` por método.
- Backend em dois processos pode servir código antigo; reiniciar um só.
