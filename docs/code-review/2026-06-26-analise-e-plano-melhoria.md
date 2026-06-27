# Análise de Código e Plano de Melhoria — INNOVA Backend

> Data: 2026-06-26 · Repositório: backend NestJS + Prisma + PostgreSQL
> Âmbito: este documento cobre o **backend**. O frontend (React) é um
> repositório git separado e é tratado à parte (ver secção final).
> Estado: ✅ = já implementado · ⏳ = por fazer

Este documento responde a um pedido de revisão em 8 eixos (arquitectura, boas
práticas, segurança, performance, testes, TypeScript, escalabilidade,
manutenção). Para cada problema: **o que é** (simples), **como se resolve**
(antes/depois), e **porquê** (benefício). A ordem segue a prioridade pedida:
**segurança e performance primeiro**.

---

## Mapa rápido (o que foi feito vs o que falta)

| Eixo | Estado | Onde |
|---|---|---|
| Segurança | ✅ feito | PR #5/#6 (`3beba49`), PR #7 (`c90fba1`) |
| Performance (backend) | ✅ feito | `6ac3151`, `dfbc9c4`, `12a5612` |
| Arquitectura/camadas | ✅ feito | `fa81b11`, `646217f` |
| Boas práticas | ✅ feito | `646217f` |
| Testes | ✅ feito | `9de7393`, `6da30c8` |
| TypeScript (sem `any`) | 🟡 parcial | `f6452c1` + item 5; resta dívida |
| Escalabilidade | 🟡 parcial | feito: paginação/sequences/réplica · falta: **Redis (item 3)** |
| Manutenção | ✅ feito | refactors acima |
| Performance frontend (React) | ⏳ outro repo | secção final |

---

# 1. SEGURANÇA (prioridade máxima)

## 1.1 ✅ Papéis errados deixavam endpoints "trancados" ou mal protegidos

**O problema (simples):** vários endpoints exigiam o papel `MANAGER`, mas na
base de dados o papel chama-se `GESTOR`. Resultado: ou ninguém conseguia
entrar (papel inexistente), ou a proteção não era a esperada.

**Antes:**
```ts
@Roles('ADMIN', 'RH', 'MANAGER')   // 'MANAGER' não existe na BD
```
**Depois:**
```ts
@Roles('ADMIN', 'RH', 'GESTOR')    // papel real
```

**Porquê:** um controlo de acesso que aponta para um papel inexistente é um
bug de segurança — ou bloqueia quem devia entrar, ou cria uma falsa sensação
de proteção. (`3beba49`)

## 1.2 ✅ Criação de contas virou operação administrativa, sem auto-login

**O problema:** o endpoint de criar conta não estava claramente restrito, e
quem criava uma conta podia ficar autenticado como o novo utilizador.

**Depois (com comentário no código):**
```ts
// Criação de contas é uma operação administrativa: apenas ADMIN e RH.
// NÃO define o cookie de sessão — quem cria a conta não deve ficar
// autenticado como o novo utilizador.
@Roles(Role.ADMIN, Role.RH)
```

**Porquê:** impede escalada de privilégios (criar conta ≠ entrar nela) e
garante que só RH/Admin criam utilizadores. (`3beba49`)

## 1.3 ✅ Removida uma segunda aplicação "fantasma" em Express

**O problema:** além da app NestJS, havia restos de uma app antiga em Express
(`src/server.ts`, `src/routes/`, `src/controllers/`, `src/services/enrollmentService.ts`).
Código morto que ainda podia abrir portas/rotas → superfície de ataque e
confusão.

**Depois:** apagados (~525 linhas removidas).

**Porquê:** menos código = menos superfície de ataque e menos formas de a
proteção "fugir" por uma rota esquecida. (`3beba49`)

## 1.4 ✅ Segredos JWT obrigatórios

**O problema:** se o segredo do JWT não estivesse definido, a app podia
arrancar com um valor fraco/por omissão.

**Depois:** `auth.service.ts`/`jwt.strategy.ts` passam a exigir os segredos.

**Porquê:** tokens assinados com segredo fraco são falsificáveis. (`3beba49`)

## 1.5 ✅ Papéis em falta no seed (item 4)

**O problema:** `@Roles(DIRECTOR/LIDER/AUDITOR/INSTRUCTOR)` em endpoints, mas o
seed só criava `ADMIN/RH/GESTOR/COLABORADOR`. Endpoints ficavam inacessíveis.
Havia ainda dois nomes para o mesmo papel: `INSTRUTOR` (PT) e `INSTRUCTOR`.

**Antes (`role.enum.ts`):**
```ts
INSTRUTOR = 'INSTRUTOR',
INSTRUCTOR = 'INSTRUCTOR',
// seed: ['ADMIN','RH','GESTOR','COLABORADOR']
```
**Depois:**
```ts
INSTRUCTOR = 'INSTRUCTOR',   // alias PT removido (não era usado)
// seed: + 'LIDER','DIRECTOR','AUDITOR','INSTRUCTOR'
```

**Porquê:** os endpoints protegidos por esses papéis voltam a ser acessíveis a
quem deve. (`c90fba1`, PR #7)

---

# 2. PERFORMANCE (prioridade alta)

## 2.1 ✅ Somar com a base de dados em vez de trazer tudo para memória

**O problema:** para calcular totais, o código trazia **todas** as linhas e
somava em JavaScript. Com muitos registos, é lento e gasta memória.

**Antes:**
```ts
const grants = await this.prisma.fundingGrant.findMany({
  select: { amount: true, disbursed: true, status: true },
});
const totalCommitted = grants.reduce((s, g) => s + g.amount, 0);
const totalReceived  = grants.reduce((s, g) => s + g.disbursed, 0);
```
**Depois:**
```ts
// A base de dados soma as colunas (aggregate) — custo constante,
// não O(nº grants).
const { _sum } = await this.prisma.fundingGrant.aggregate({
  _sum: { amount: true, disbursed: true },
});
const totalCommitted = _sum.amount ?? 0;
const totalReceived  = _sum.disbursed ?? 0;
```

**Porquê:** a soma passa a ser feita pela BD (rápida e constante), em vez de
carregar milhares de linhas só para somar. (`6ac3151`)

## 2.2 ✅ Geração de códigos sem colisões sob carga

**O problema:** códigos `FIN-00001`/`GRT-00001` eram gerados com "ler o último
e somar 1". Com vários pedidos ao mesmo tempo, dois podiam ler o mesmo último
e gerar o mesmo código → erro de duplicado.

**Depois:** uma `SEQUENCE` da base de dados (contador atómico):
```sql
CREATE SEQUENCE IF NOT EXISTS funder_code_seq AS INTEGER START WITH 1;
-- nextval() é atómico → nunca devolve o mesmo número duas vezes,
-- mesmo com centenas de pedidos simultâneos.
```

**Porquê:** elimina a "corrida" — exatamente o cenário dos testes de carga com
muitos utilizadores. (`dfbc9c4`)

## 2.3 ✅ Paginação (não devolver tudo de uma vez)

**O problema:** endpoints como "relatórios em atraso" devolviam **toda** a
lista. Hoje são poucos; amanhã podem ser milhares → resposta pesada e lenta.

**Antes:**
```ts
getOverdueReports() {
  return this.service.getOverdueReports();
}
```
**Depois:**
```ts
getOverdueReports(
  @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
) {
  return this.service.getOverdueReports(page, limit);
}
```

Além disso (`12a5612`), foi aplicado um **tecto de paginação** transversal a
dezenas de controllers, para nenhum pedido conseguir puxar um `limit` enorme.

**Porquê:** respostas previsíveis e leves à medida que os dados crescem.
(`dfbc9c4`, `12a5612`)

---

# 3. ARQUITECTURA E CAMADAS

## 3.1 ✅ Leitura por réplica e auditoria centralizadas

**O problema:** a escolha de "ler da réplica" e o registo de auditoria estavam
espalhados e repetidos por ~58 serviços, cada um à sua maneira.

**Depois:** um getter de leitura central no `PrismaService` e um
`AuditService` comum (`src/common/services/audit.service.ts`). Os serviços
passam a usar a mesma porta de entrada.

**Porquê:** menos repetição, comportamento consistente, e mudar a estratégia
(ex.: routing de réplica) passa a ser num sítio só. (`fa81b11`)

## 3.2 ✅ Separar "efeito secundário" da lógica principal

**O problema:** criar um grant também enviava uma notificação, tudo misturado
na mesma função.

**Antes:**
```ts
async createGrant(...) {
  const grant = await this.prisma.fundingGrant.create(...);
  const currency = dto.currency || 'AOA';
  await this.prisma.notificationLog.create({ ... });
  return grant;
}
```
**Depois:**
```ts
async createGrant(...) {
  const grant = await this.prisma.fundingGrant.create(...);
  await this.notifyGrantCreated(grant, dto, userId);  // efeito separado
  return grant;
}

/** Notificação de grant criado — efeito secundário separado de createGrant. */
private notifyGrantCreated(grant, dto, userId) { ... }
```

**Porquê:** cada função tem uma responsabilidade; mais fácil de ler, testar e,
mais tarde, mover a notificação para 2.º plano (ver item 3/Redis). (`646217f`)

---

# 4. BOAS PRÁTICAS

## 4.1 ✅ Fim dos "números mágicos"

**Antes:**
```ts
const in30Days = new Date(now.getTime() + 30 * 86400000);
const currency = dto.currency || 'AOA';
```
**Depois:**
```ts
const MS_PER_DAY = 86_400_000;
const DEFAULT_CURRENCY = 'AOA'; // moeda oficial: Kwanza angolano
...
const in30Days = new Date(now.getTime() + 30 * MS_PER_DAY);
const currency = dto.currency || DEFAULT_CURRENCY;
```

**Porquê:** um nome explica o que o número significa; muda-se num sítio só.
(`646217f`)

---

# 5. TYPESCRIPT (tipos correctos, sem `any`)

## 5.1 ✅ `@CurrentUser` deixou de ser `any`

**O problema:** o utilizador autenticado chegava aos controllers como `any` —
sem ajuda do editor e sem segurança de tipos.

**Depois:** criado `src/common/types/current-user.ts` com `CurrentUserData`,
aplicado em 56 ficheiros:
```ts
// antes:  @CurrentUser() user: any
// depois: @CurrentUser() user: CurrentUserData
```

**Porquê:** erros apanhados em compilação, autocompletar correcto, código mais
seguro. (`f6452c1`)

## 5.2 ✅ Item 5 removeu `as any` no serviço de relatórios

Os modelos `SavedReport`/`ReportSchedule` passaram a existir, eliminando os
`(this.prisma as any).savedReport?.…` (ver secção 7).

## 5.3 ⏳ Dívida de `any` que ainda fica (por fazer)

Ainda existe `any` propositado e documentado:
- `reports.service.ts`: getter `private get prismaRead(): any` e vários
  `where: any`.
- Modelos do "Grupo A" (`recognition`, `feedback`, `moodCheckin`) acedidos via
  `any` porque ainda não existem no schema.

**Plano:** ao construir o Grupo A (criar os modelos), o `any` desaparece
naturalmente; os `where: any` podem ser tipados com os tipos gerados pelo
Prisma (`Prisma.UserWhereInput`, etc.). **Prioridade: baixa** (não é bug, é
limpeza).

---

# 6. TESTES (comportamento, não implementação)

## 6.1 ✅ Specs alinhados com os refactors

Cada refactor trouxe a atualização dos testes para validarem **comportamento**
(o que o endpoint devolve), não detalhes internos. (`9de7393`, `6da30c8`)

## 6.2 ✅ Cobertura do módulo de relatórios

Após o item 5: `jest src/reports` → **4 suites, 71 testes, 0 falhas**.

## 6.3 ⏳ Melhoria menor (por fazer)

Algumas asserções podiam ser mais exigentes (validar argumentos passados ao
`create`/`where`), não só o resultado. **Prioridade: baixa.**

---

# 7. ESCALABILIDADE

## 7.1 ✅ Já feito

Paginação (2.3), sequences (2.2), agregação na BD (2.1) e leitura por réplica
(3.1) — todos ajudam o sistema a aguentar mais dados e utilizadores.

## 7.2 ✅ Biblioteca/agendamento de relatórios passou a persistir (item 5)

**O problema:** `/reports/saved` e `/reports/schedules` acediam a modelos que
não existiam (via `any`) e devolviam mensagens "execute migration" — nunca
guardavam nada.

**Antes:**
```ts
async saveReport(userId, dto) {
  return (this.prisma as any).savedReport
    ?.create({ ... })
    .catch(async () => ({ message: 'execute migration', ...dto }));
}
```
**Depois:**
```ts
async saveReport(userId: number, dto: SaveReportDto) {
  return this.prisma.savedReport.create({ data: { ...dto, createdById: userId } });
}
```
+ modelos `SavedReport`/`ReportSchedule` e migração. (PR #7)

## 7.3 ⏳ Item 3 — trabalho em 2.º plano + cache (Redis) — **PRÓXIMO**

**O problema:** com ~6000 funcionários, duas coisas pesam:
- (a) notificações/auditoria correm "à frente" do utilizador, que espera por
  elas sem precisar;
- (b) os dashboards refazem ~12 consultas a cada visita.

**Plano:**
- Mover notificações/auditoria para uma **fila** (BullMQ/Redis) ou eventos →
  o utilizador deixa de esperar.
- **Cachear** dashboards no Redis (cache partilhado entre instâncias).

**Porquê:** tira trabalho do caminho do utilizador e evita recalcular o mesmo
a cada visita — o sistema aguenta muito mais com o mesmo hardware. Decisão já
tomada: **Redis vai existir**. **Prioridade: alta — é o próximo trabalho.**

---

# 8. MANUTENÇÃO

Coberta pelos refactors das secções 3 e 4: responsabilidades separadas, nomes
descritivos, código central reutilizado. O resultado é mais fácil de ler e
mudar.

---

# 9. O QUE FALTA (resumo priorizado)

| Prioridade | Item | Estado |
|---|---|---|
| **Alta** | **Item 3 — fila + cache com Redis** (escalabilidade) | ⏳ próximo |
| Média | Item 5 / **Grupo A** — `recognition`, `feedback`, `moodCheckin` (modelos + escrita) | ⏳ |
| Baixa | Limpar `any` residual (`prismaRead`, `where: any`) | ⏳ |
| Baixa | Asserções de teste mais exigentes | ⏳ |
| Separado | **Frontend React** — `react.memo`, `useCallback`, `useMemo`, otimizações | ⏳ outro repo |

---

# 10. Código revisado com comentários

O "código revisado" pedido já está aplicado no repositório, com comentários
explicativos no próprio código, e disponível para revisão nos PRs:

- **PR #6** (merged em `main`): segurança, RBAC por enum, tipos
  `CurrentUserData`, agregação, réplica/auditoria centralizadas, paginação.
- **PR #7** (aberto): `crm-funders` (sequence + paginação), papéis (item 4),
  biblioteca/agendamento de relatórios (item 5, Grupo B).

Os ficheiros mais ilustrativos para ler o "depois" comentado:
- `src/crm-funders/crm-funders.service.ts` (aggregate, sequence, efeito
  secundário separado, números mágicos)
- `src/common/types/current-user.ts` (tipo do utilizador autenticado)
- `src/common/services/audit.service.ts` e `src/prisma/prisma.service.ts`
  (auditoria + leitura por réplica centralizadas)
- `src/reports/reports.service.ts` (modelos reais, sem `as any`)

---

## Sequência de trabalho acordada

1. **Este documento** (análise + plano). ✅
2. **Item 3 — Redis** (fila + cache). ⏳ a seguir.
3. **Frontend React** (trazer o repo + `react.memo`/`useCallback`/`useMemo` +
   otimizações). ⏳ por último.

> Um de cada vez, para não sobrecarregar a máquina.
