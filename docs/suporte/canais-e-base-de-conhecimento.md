# Suporte ao cliente: canais, tempos de resposta e base de conhecimento

> Fonte única dos tempos prometidos: `src/support/support.sla.ts` (é também o que a página **Ajuda e Suporte** mostra ao utilizador).
> Alinhado com `docs/deploy/sla-contratual.md` (incidente crítico: resposta inicial em 1 h útil).

## Canais

| Canal | Para quê | Disponível |
|---|---|---|
| **Pedidos (tickets)** na plataforma — *Ajuda e Suporte → Os meus pedidos* | Tudo o que precisa de acompanhamento: problemas, acessos, pedidos | Sempre; respondido em horário útil |
| **E-mail** (`SUPPORT_EMAIL`) | Quem não consegue entrar na plataforma | Sempre; respondido em horário útil |
| **Página de estado** | Saber se há um incidente em curso, antes de abrir um pedido | Sempre |

Chat em direto **não é oferecido** por agora: garantir tempos de resposta num chat exige cobertura contínua que a equipa actual não tem. Prometer só o que se cumpre. Rever quando houver volume que o justifique.

Horário útil: segunda a sexta, 08:00–18:00, hora de Luanda.

## Tempos de primeira resposta (em horas úteis)

| Prioridade | Quando usar | Primeira resposta |
|---|---|---|
| **Crítica** | Não consigo trabalhar / plataforma em baixo para mim ou para a equipa | 1 h |
| **Alta** | Funcionalidade importante falha, há alternativa penosa | 4 h |
| **Normal** | Dúvida ou problema que não bloqueia | 8 h |
| **Baixa** | Sugestão, pedido sem urgência | 24 h |

"Primeira resposta" é uma pessoa a responder (não uma confirmação automática). O prazo fica registado em cada pedido (`firstResponseDueAt`); a fila de suporte ordena por ele e destaca os atrasados. O indicador *"respondidos dentro do prazo"* sai de `GET /support/tickets/summary` e deve ser revisto semanalmente.

Resolução não tem prazo contratual: depende do problema. O suporte actualiza o pedido sempre que houver novidade.

## Funcionamento

- Quem abre o pedido escolhe a prioridade e a categoria; o suporte pode mudar o estado (`OPEN → IN_PROGRESS → WAITING_CUSTOMER → RESOLVED → CLOSED`).
- Notas internas ficam visíveis só ao suporte.
- Responder a um pedido resolvido reabre-o; um pedido fechado exige novo pedido.
- Quem trata a fila: papéis ADMIN e RH.

## Base de conhecimento (reduzir pedidos repetitivos)

1. Ao escrever o assunto de um pedido novo, a plataforma sugere artigos (`GET /knowledge/search`) e perguntas frequentes — o utilizador só abre o pedido se não encontrar resposta.
2. As **perguntas frequentes** vivem em `frontend/content/faq.ts` (revistas por PR).
3. Os **tutoriais completos** são artigos do módulo *Base de Conhecimento* (`/knowledge`), numa categoria "Ajuda INNOVA" (a criar por um administrador em Base de Conhecimento → Categorias; ainda não existe nenhum artigo).
4. **Ciclo de melhoria:** todos os meses, listar as categorias com mais pedidos e as pesquisas sem resultado (`KnowledgeSearchLog`); escrever um artigo para cada uma das 3 maiores e acrescentar-lhe o link na FAQ.
5. Quando um pedido é fechado e a resposta foi um passo-a-passo, esse passo-a-passo passa a artigo.

## Novidades (changelog para clientes)

`frontend/content/novidades.ts` — uma entrada por mudança visível, em linguagem de cliente (o que muda *para si*, não o que se refactorizou), mais recente primeiro. Mostrada em *Ajuda e Suporte → Novidades*. Correcções de incidentes relevantes entram aqui com ligação ao post-mortem resumido. O `CHANGELOG.md` da raiz continua a ser o registo técnico para a equipa.
