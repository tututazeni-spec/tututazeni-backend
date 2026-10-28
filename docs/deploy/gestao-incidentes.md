# Gestão de incidentes

> Complementa `status-page.md` (como publicar), `sla-slo.md` (orçamento de erro) e `runbook.md` (como actuar tecnicamente).
> Um incidente é qualquer degradação ou indisponibilidade que afecta clientes, ou um risco claro de a afectar.

## 1. Severidades

| Sev | Critério | Exemplos | Primeira acção | Comunicação ao cliente |
|---|---|---|---|---|
| **SEV1** | Plataforma indisponível ou perda/exposição de dados | Todas as réplicas em baixo; login a falhar para todos; suspeita de fuga de dados | ≤ 15 min (a qualquer hora, via alertas) | Página de estado ≤ 10 min; actualização de 30 em 30 min |
| **SEV2** | Funcionalidade principal degradada ou parte dos clientes afectada | Pagamentos/folha a falhar; lentidão severa; filas paradas | ≤ 1 h útil | Página de estado ≤ 30 min; actualização de hora a hora |
| **SEV3** | Falha limitada, existe alternativa | Um relatório falha; e-mails atrasados | Próximo dia útil | Só se houver pedidos de suporte; nota no changelog ao corrigir |

Em dúvida entre duas severidades, escolhe-se a mais alta; desce-se depois.

Incidentes de **segurança ou dados pessoais** são sempre tratados como SEV1 até prova em contrário e seguem também `docs/security/` e a notificação LPDP (ver `sla-contratual.md`).

## 2. Papéis (uma pessoa pode acumular em equipas pequenas)

- **Responsável do incidente (IC):** coordena, decide, não depura. Mantém o registo cronológico.
- **Operador:** investiga e aplica a correcção (ver `runbook.md`).
- **Comunicação:** publica na página de estado e responde aos pedidos de suporte com a mesma mensagem.

### 2.1 Quem faz o quê, passo a passo

Os papéis são ocupados por pessoas concretas na escala de cada período (`primeiras-72h.md` para o lançamento; depois, a escala de piquete em vigor). **Se a escala não estiver preenchida, não há procedimento — preencher é pré-requisito do go-live.**

| Passo | IC | Operador | Comunicação | Suporte (fila de pedidos) |
|---|---|---|---|---|
| Alerta recebido / pedido CRITICAL | **Reconhece em ≤ 15 min (SEV1)** e assume o papel de IC | Confirma o sintoma nas sondas e logs | — | Escala ao IC qualquer pedido CRITICAL ou 3+ pedidos iguais em 15 min |
| Declarar e classificar | **Decide a severidade** e abre a entrada em `ops/status-page/incidents.json` | Fornece o impacto (quem, o quê, desde quando) | Prepara a primeira mensagem | Anexa pedidos ao incidente |
| Mitigar | **Aprova** rollback/feature flag/redução de carga | **Executa** (`runbook.md`, `deploys-graduais.md`) e reporta de 10 em 10 min | — | — |
| Comunicar | Valida o texto | — | **Publica** na página de estado nos prazos da secção 1 e dá o mesmo texto ao suporte | **Responde** aos pedidos com a mensagem aprovada |
| Resolver | **Declara** resolvido após 30 min estáveis | Confirma alertas limpos | Marca `resolved` com `resolvedAt` e publica o resumo | Fecha/actualiza os pedidos ligados |
| Aprender | **Marca** o post-mortem (≤ 5 dias úteis) e é o dono do documento | Fornece cronologia técnica | Fornece o que foi dito e quando | Fornece o impacto visto nos pedidos |

Regras:

- **Uma só voz para o cliente.** Só o papel Comunicação publica; o Operador não responde a clientes durante o incidente.
- **O IC não mexe em produção.** Se o IC e o Operador forem a mesma pessoa (equipa mínima), diz-se isso no registo e a decisão de rollback é confirmada por uma segunda pessoa por mensagem, mesmo que breve.
- **Escalar sem esperar:** se o primeiro contacto não reconhecer em 15 min (SEV1) ou 30 min (SEV2), liga-se ao suplente da escala; passados mais 15 min, ao responsável de engenharia. Nunca se espera por quem "devia" estar disponível.
- **Registo cronológico** (hora · quem · o quê) mantido pelo IC desde a declaração; é a base do post-mortem.
- **Segurança/dados pessoais:** além dos passos acima, o IC avisa o responsável de privacidade na hora da confirmação; a notificação à autoridade e ao cliente segue os prazos de `sla-contratual.md`. Não se apagam logs nem se reinicia o que possa ser prova antes de o IC autorizar.

## 3. Ciclo de vida

1. **Detectar** — alerta (`alerting.md`), sonda da página de estado, ou pedido de suporte com prioridade CRITICAL.
2. **Declarar** — o IC atribui a severidade e abre a entrada em `ops/status-page/incidents.json` (`investigating`). Declarar cedo é preferível a declarar certo.
3. **Mitigar primeiro, explicar depois** — rollback (`deploys-graduais.md`), reduzir carga, desligar uma feature flag. A causa raiz é trabalho do post-mortem, não do incidente.
4. **Comunicar** — factos e hora; sem culpar terceiros; sem prometer o que não controlamos; actualizações nos intervalos da tabela acima.
5. **Resolver** — confirmar nas sondas e nos alertas durante 30 min (`monitoring`); marcar `resolved` com `resolvedAt`.
6. **Aprender** — post-mortem conforme o ponto 4.

## 4. Post-mortem sem culpas

**Quando:** todo o SEV1 e SEV2, e qualquer incidente que consuma > 10 % do orçamento de erro mensal (`sla-slo.md`). SEV3 só se for recorrente.
**Prazo:** reunião em ≤ 5 dias úteis; documento publicado em ≤ 10 dias úteis, em `docs/postmortems/AAAA-MM-DD-titulo.md` (modelo: `postmortem-template.md`).

Princípios:

- **Sem culpas:** pergunta-se *como o sistema permitiu isto*, nunca *quem falhou*. Nomes de pessoas não entram no documento, só papéis.
- A decisão que alguém tomou fazia sentido com a informação que tinha naquele momento; se não fazia, a falha está na informação, nas ferramentas ou no processo.
- Cada causa leva a uma **acção preventiva com dono e data**; acções sem dono não contam como acções.
- O resumo para clientes (3–5 frases: o que aconteceu, impacto, o que mudámos) vai para a página de estado e, se relevante, para as notas de versão.

## 5. Revisão

Trimestralmente: rever as acções dos post-mortems por fechar, a taxa de incidentes por severidade e se os tempos de comunicação foram cumpridos.
