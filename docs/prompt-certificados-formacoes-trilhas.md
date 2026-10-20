# Prompt para Claude Code — Certificados de Formações e Trilhas (INNOVA)

Copia o bloco abaixo e cola no Claude Code, a partir da raiz do backend (`C:\Users\PLÁCIDO COSTA\innova`). O frontend (`innova\frontend`) é um repositório Git separado, por isso as alterações devem ir em branches e commits distintos.

---

```text
Contexto
Na INNOVA (NestJS + Prisma + PostgreSQL no backend; Next.js 15 App Router + Tailwind no frontend), o módulo de certificados já emite certificados automaticamente ao concluir um Curso. Para Formações e Trilhas NÃO emite, porque não existem dados de presença e progresso utilizáveis. Quero resolver isto sem bloquear a emissão.

Passo 0 — Investigação (não alteres nada ainda)
1. Localiza o módulo de certificados (service, controller, DTOs, models Prisma, templates, assinatura electrónica) e explica como a emissão é despoletada nos Cursos (evento, hook, chamada directa?).
2. Localiza os modelos Prisma de Formações (Training), Trilhas, Inscrições/matrículas, Presenças e Progresso. Diz-me exactamente que campos existem, quais estão preenchidos na prática e o que falta para decidir "concluiu".
3. Identifica porque é que hoje Formações/Trilhas não emitem (ex.: dados nulos, modelos sem relação, estados nunca actualizados).
4. Apresenta-me um resumo curto do que encontraste e espera a minha confirmação antes de implementar.

Passo 1 — Regra de conclusão configurável por Formação
Adiciona a cada Formação um campo `completionMode` com os valores:
- `MANUAL` — o instrutor/Admin marca cada participante como "Concluído" (valor por defeito, funciona sem dados de presença);
- `ATTENDANCE` — conclui quando a presença >= `minAttendancePercent` (campo configurável, ex.: 75);
- `HYBRID` — presença mínima + aprovação manual.
Cria migração Prisma com valores por defeito seguros, para não partir Formações existentes.

Passo 2 — Estado de conclusão por inscrição
Garante que a inscrição tem: `completionStatus` (PENDING | COMPLETED | NOT_COMPLETED), `completedAt`, `completedById`, `finalGrade` (opcional) e `attendancePercent` (opcional). Endpoint protegido (roles Admin/Instrutor, via `lib/roles`/guards existentes) para marcar conclusão individual e em lote.

Passo 3 — Emissão de certificado de Formação
Ao passar para COMPLETED, emite o certificado reutilizando o serviço de certificados já existente (mesmos templates, assinatura electrónica padronizada, campos editáveis: nome completo, logo da medalha, frase descritiva com carga horária e conteúdos, "Instrutor"). A emissão deve ser idempotente (nunca duplicar certificado para a mesma inscrição) e registar quem a despoletou. Permite reemissão/revogação apenas por Admin.

Passo 4 — Trilhas
A conclusão de uma Trilha deriva das suas unidades (Cursos/Formações), que já têm ou passam a ter estado de conclusão:
- Trilha concluída quando todas as unidades obrigatórias estão COMPLETED;
- ao completar a última, emite o certificado da Trilha (template próprio ou o mesmo, com a lista de unidades na frase descritiva);
- usa recálculo por evento (ao concluir uma unidade) e um endpoint/job de reconciliação para casos antigos.

Passo 5 — Retroactivos
Cria um script/endpoint Admin (dry-run por defeito) que lista os participantes de Formações/Trilhas já elegíveis e emite os certificados em falta, com relatório do que foi criado/ignorado.

Passo 6 — Frontend (repositório separado)
- Na página da Formação: selector do modo de conclusão, campo de presença mínima quando aplicável, e tabela de participantes com acção "Marcar como concluído" (individual e em lote) e botão de ver/descarregar certificado.
- Na Trilha: indicador de progresso por unidade e estado do certificado.
- Seguir o design system (navy #0F1F3D, dourado #D4A017, abas em "cartão" para principais e "pílula" para secundárias).

Regras
- Não uses `any`; DTOs validados; Prisma Decimal tratado correctamente na serialização.
- Sem alterar o comportamento actual dos Cursos.
- Testes unitários para: regra de conclusão por modo, idempotência da emissão e conclusão de Trilha.
- No fim, corre e corrige: backend `npm run lint:check`, `npm run format:check`, `npm run build`, `npm test`; frontend `npx eslint .`, `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, `npm run build`.
- Trabalha por passos, mostra o diff de cada um e não avances sem o meu OK.
```
