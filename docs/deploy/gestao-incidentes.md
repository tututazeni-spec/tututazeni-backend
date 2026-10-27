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
