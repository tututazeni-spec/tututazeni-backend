# Módulo de Certificados — Prompts para o Claude Code

Aplicar por ordem. Backend: `C:\Users\PLÁCIDO COSTA\innova` (NestJS + Prisma). Frontend: `C:\Users\PLÁCIDO COSTA\innova\frontend` (repositório Git separado, Next.js 15).

---

## Prompt 1 — Restaurar versão antiga de um modelo de certificado

```
Contexto: no módulo de certificados da INNOVA (NestJS + Prisma no backend, Next.js 15 + Radix + Tailwind no frontend), os modelos (templates) têm histórico de versões, mas esse histórico é apenas de consulta. Quero poder restaurar uma versão antiga.

ANTES DE ALTERAR CÓDIGO: explora o módulo existente (controller, service, DTOs, modelos Prisma, página do frontend) e resume-me como as versões são guardadas hoje. Não assumas nomes de ficheiros ou campos; usa os que existem.

Objetivo: "Restaurar esta versão" a partir do histórico, de forma NÃO destrutiva.

Regras de negócio:
1. Restaurar NUNCA apaga nem altera versões existentes. Cria uma NOVA versão (n+1) que é cópia do conteúdo da versão escolhida (layout, campos editáveis, posições, imagem de fundo, textos, configuração da medalha/logo e assinatura). Essa nova versão passa a ser a versão ativa/atual.
2. Registar na nova versão a origem: `restoredFromVersionId` (ou equivalente) e uma nota automática ("Restaurada da versão X").
3. Certificados já emitidos mantêm-se ligados à versão com que foram gerados; não são regenerados nem alterados.
4. Só utilizadores com permissão de gestão de modelos (usar o sistema de roles existente em `lib/roles.ts` / guards do backend) podem restaurar.
5. Operação atómica (transação Prisma) e com registo de auditoria (quem, quando, qual versão).
6. Se a versão escolhida já for a atual, devolver erro claro (400) e não criar duplicado.
7. Multi-tenant: validar que o modelo e a versão pertencem ao tenant do utilizador.

Backend:
- Novo endpoint, ex.: `POST /certificate-templates/:id/versions/:versionId/restore`, com guard JWT global (sem `@Public()`), DTO e validação.
- Lógica no service, sem `any` (TypeScript estrito), com migração Prisma se for preciso novo campo.
- Testes unitários: restauro com sucesso, versão já atual, versão de outro tenant, sem permissão.

Frontend:
- No histórico de versões, botão "Restaurar" por versão (oculto/desativado na versão atual e para quem não tem permissão).
- Modal de confirmação a explicar: "Será criada uma nova versão com o conteúdo da versão X. As versões anteriores e os certificados já emitidos não são alterados."
- Toast de sucesso/erro e atualização da lista (invalidate/refetch).
- Respeitar o design system (navy #0F1F3D, dourado #D4A017, Plus Jakarta Sans/Inter, grelha de 8px) e o padrão de abas/pílulas já definido.

No fim, corre e corrige até passar:
- Backend: `npm run lint:check`, `npm run format:check`, `npm run build`, `npm test`
- Frontend: `npx eslint .`, `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, `npm run build`

Mostra-me os ficheiros alterados e o resumo das decisões. Não faças commit sem eu pedir.
```

---

## Prompt 2 — Formações e trilhas a emitir certificados

```
Contexto: no módulo de certificados da INNOVA, os Cursos já emitem certificado ao concluir, mas as Formações e as trilhas não emitem, porque não há dados de presença e progresso utilizáveis.

ANTES DE ALTERAR CÓDIGO: investiga o que existe hoje para Formações e trilhas (modelos Prisma, presenças, progresso, inscrições, estados de conclusão) e diz-me exatamente que dados faltam ou estão inutilizáveis. Não assumas nada; mostra-me o diagnóstico primeiro.

Objetivo: permitir emitir certificados de Formações e trilhas sem depender de dados que ainda não existem.

Proposta a implementar (depois do diagnóstico):
1. Critérios de conclusão configuráveis por Formação/trilha: presença mínima (%), nota mínima (opcional), conclusão de todos os módulos da trilha (opcional).
2. Emissão automática quando os critérios forem cumpridos e os dados existirem (reutilizar o mesmo motor de geração dos Cursos, com o mesmo modelo, assinatura eletrónica padronizada e campos editáveis).
3. Emissão manual como alternativa: o instrutor/administrador seleciona participantes e emite, com justificação registada (auditoria: quem emitiu, quando, motivo). Isto desbloqueia o uso real enquanto a recolha de presenças/progresso não estiver completa.
4. Idempotência: nunca emitir dois certificados para o mesmo participante e a mesma Formação/trilha; permitir reemissão controlada (nova versão do ficheiro, mantendo o código de verificação).
5. Cada certificado fica ligado à versão do modelo usada na emissão.

Backend: services/DTOs/endpoints novos sem `any`, migração Prisma se necessário, guards e roles existentes, validação por tenant, testes unitários dos critérios e da idempotência.
Frontend: configuração dos critérios na Formação/trilha, ação "Emitir certificados" (automática/manual) com modal de seleção e confirmação, estados visíveis (elegível, emitido, pendente), no design system da INNOVA.

No fim, corre e corrige até passar:
- Backend: `npm run lint:check`, `npm run format:check`, `npm run build`, `npm test`
- Frontend: `npx eslint .`, `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, `npm run build`

Mostra-me o diagnóstico, os ficheiros alterados e as decisões. Não faças commit sem eu pedir.
```
