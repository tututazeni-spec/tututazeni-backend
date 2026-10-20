# INNOVA — Formato de email por tenant (Carrinho SA) + entrega de emails

> Documento de instruções para o Claude Code. Ler tudo antes de alterar código.
> Primeiro explorar o repositório e confirmar os nomes reais dos ficheiros, módulos e modelos; não assumir.

---

## 1. Contexto

A INNOVA vai ser licenciada à empresa **Carrinho SA**. O email corporativo deles segue o formato:

```
nome.apelido@carrinho-sa.com
```

Exemplo: `antonio.miguel@carrinho-sa.com`

As contas da plataforma para este cliente devem usar **exactamente o mesmo formato**. A regra aplica-se **apenas** ao tenant da Carrinho SA; os restantes clientes continuam livres.

**Stack**
- Backend: NestJS + Prisma + PostgreSQL (repo `tututazeni-backend`, pasta local `innova`)
- Frontend: Next.js 15 App Router (repo `tututazeni-frontend`, pasta `innova/frontend`) — **repositório Git separado**, com branch e remote próprios
- Autenticação: JWT com guard global e decorator `@Public()`
- Módulo de definições (Settings) já permite configurar o nome do tenant

**Convenções do projecto**
- TypeScript sem `any`
- Tratar a serialização de `Decimal` do Prisma no frontend
- Design system: navy `#0F1F3D`, dourado `#D4A017`, fontes Plus Jakarta Sans/Inter, grelha de 8px
- Abas principais em "cartão"; abas secundárias e filtros em "pílula", dispostos verticalmente

---

## 2. Parte A — Formato de email por tenant

### A1. Configuração por tenant

Guardar nas definições do tenant (onde já está o nome do tenant):

| Campo              | Valor para a Carrinho SA                         |
| ------------------ | ------------------------------------------------ |
| `emailDomain`      | `carrinho-sa.com`                                |
| `emailPattern`     | `{primeiroNome}.{apelido}`                       |
| `emailPolicyMode`  | `ENFORCE` (bloqueia) ou `SUGGEST` (só avisa)     |

- Adicionar os campos ao modelo Prisma do tenant/definições, com migração.
- Tenants sem `emailDomain` mantêm o comportamento actual (sem restrições).
- **Decisão pendente do dono do produto:** a regra é obrigatória ou apenas sugestão? Implementar os **dois modos** através de `emailPolicyMode` e usar `SUGGEST` como valor por defeito até haver confirmação.
- O Admin deve poder editar estes campos no módulo Settings.

### A2. Normalização do nome (função utilitária única)

Criar uma função partilhada, com testes unitários, que gera a sugestão a partir do nome completo:

- minúsculas;
- remover acentos (ex.: "António Miguel" → `antonio.miguel`);
- remover espaços e caracteres especiais;
- `{primeiroNome}` = primeiro nome; `{apelido}` = último nome (configurável no futuro);
- resultado: `<primeiroNome>.<apelido>@<emailDomain>`.

### A3. Validação no backend (NestJS)

Aplicar na **criação**, **edição** e **importação em massa** de utilizadores:

- o email tem de terminar em `@<emailDomain>` do tenant;
- tudo em minúsculas, sem espaços;
- verificar o padrão `nome.apelido` (parte local com um ponto a separar nome e apelido, aceitando sufixo numérico para homónimos, ex.: `antonio.miguel2`);
- em modo `ENFORCE`: rejeitar com mensagem clara em português;
- em modo `SUGGEST`: aceitar, mas devolver um aviso na resposta;
- garantir unicidade do email (por tenant) e devolver erro claro em caso de duplicado.

### A4. Homónimos

Se a sugestão já existir, a plataforma deve avisar e propor alternativas (`antonio.miguel2`, ou usando o nome do meio), deixando o Admin escolher. Não gerar automaticamente sem confirmação.

### A5. Frontend — módulo Users, aba Diretório

- No formulário de criação/edição de utilizador: ao escrever o nome completo, preencher automaticamente o campo de email com a sugestão (editável pelo Admin).
- Mostrar o domínio do tenant de forma clara e a mensagem de validação em tempo real.
- Mostrar o aviso de homónimo quando aplicável.
- Seguir o design system e as convenções de abas/filtros acima.

### A6. Importação em massa (Excel/CSV)

- Validar todas as linhas com as mesmas regras.
- Devolver um relatório com as linhas inválidas e o motivo (não falhar tudo por uma linha).

### A7. Nomes compostos

Confirmar com o cliente qual é o "apelido" usado nos nomes compostos (último nome, primeiro apelido, etc.) e copiar exactamente o critério do email corporativo deles. Até haver confirmação, usar o **último nome**.

---

## 3. Parte B — Entrega das notificações (Outlook / Microsoft 365)

A plataforma não envia "para o Outlook": envia para o endereço `nome.apelido@carrinho-sa.com`. O domínio da Carrinho SA (registos MX) encaminha para onde o email deles está alojado. Se for Microsoft 365/Exchange, chega ao Outlook. Isto só funciona se a caixa de correio for **real e activa**.

Emails afectados: notificações, recuperação de palavra-passe, emails de verificação de certificados (com ligação de verificação, **sem PDF anexado**).

### B1. Tarefas de código

- Garantir que **todos** os emails da plataforma saem por um serviço de email transacional (ex.: Resend, Brevo, SendGrid ou Amazon SES), e **não** directamente do servidor.
- Centralizar o envio num único serviço/módulo de email; configuração do remetente (`EMAIL_FROM`, nome e domínio de envio) por variáveis de ambiente.
- Registar o resultado de cada envio (sucesso, erro, ID do fornecedor) para diagnóstico.
- Tratar falhas sem bloquear o fluxo principal (fila/retentativas, se já existir infraestrutura para isso).
- Não adicionar dependências sem confirmar o fornecedor escolhido; se ainda não existir, perguntar qual usar.

### B2. Tarefas manuais (fora do código — apenas documentar, não executar)

**No Cloudflare (domínio de envio da INNOVA):** configurar
- **SPF**
- **DKIM**
- **DMARC**

Sem isto, o Outlook tende a mandar as mensagens para o Lixo ou a rejeitá-las. É o ponto mais importante.

**Com o TI da Carrinho SA:**
- adicionar o domínio de envio da INNOVA à lista de remetentes seguros (*allow list*) no Microsoft 365;
- confirmar que todas as caixas de correio dos colaboradores estão activas.

### B3. Teste de aceitação com o cliente

Antes da entrega final, testar com 2 ou 3 colaboradores da Carrinho SA:
1. uma notificação normal;
2. uma recuperação de palavra-passe;
3. um email de certificado com ligação de verificação.

Verificar que chegam à **Caixa de Entrada** (não ao Lixo) e que o cabeçalho da mensagem mostra SPF, DKIM e DMARC como `pass`.

> As notificações por WhatsApp planeadas são um canal separado e não dependem desta parte.

---

## 4. Critérios de aceitação

- [ ] Campos `emailDomain`, `emailPattern` e `emailPolicyMode` existem, com migração Prisma e edição no módulo Settings
- [ ] Tenants sem `emailDomain` não sofrem qualquer alteração de comportamento
- [ ] Função de normalização com testes (acentos, espaços, nomes compostos, maiúsculas)
- [ ] Criar, editar e importar utilizadores valida o email conforme o modo (`ENFORCE` / `SUGGEST`)
- [ ] Unicidade do email garantida por tenant, com mensagem clara em duplicado
- [ ] Formulário do Diretório (Users) sugere o email automaticamente e avisa sobre homónimos
- [ ] Importação em massa devolve relatório de linhas inválidas
- [ ] Todo o envio de emails passa por um único serviço, via fornecedor transacional, com registo de resultado
- [ ] Passos manuais (SPF/DKIM/DMARC, allow list, teste com colaboradores) documentados no README ou em `docs/`
- [ ] Sem `any` novo; mensagens ao utilizador em português europeu

---

## 5. Verificações de qualidade antes de concluir

**Backend**
```
npm run lint:check
npm run format:check
npm run build
npm test
```
Para ficheiros específicos: `npx eslint "src/<pasta>/**/*.ts" --config eslint.config.staged.mjs --fix`

**Frontend** (repositório Git separado)
```
npx eslint .
npx tsc --noEmit -p tsconfig.json
npx vitest run
npm run build
```

---

## 6. Como trabalhar

1. Explorar primeiro: localizar o modelo do tenant/Settings, o módulo Users (backend `src/users` ou equivalente e o `page.tsx` do frontend) e o serviço de email existente.
2. Apresentar um plano curto com os ficheiros que vai alterar e esperar confirmação.
3. Implementar backend e frontend em commits separados, cada um no seu repositório.
4. Entregar os ficheiros completos alterados e o resultado das verificações de qualidade.
5. Fazer uma única pergunta de cada vez se faltar informação.
