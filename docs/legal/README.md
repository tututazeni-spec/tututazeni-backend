# Documentos jurídicos da plataforma INNOVA

> **Estado: rascunhos técnicos para revisão por advogado.** Foram preparados por quem conhece o produto (o que os dados fazem, onde vão, que medidas existem) para que o advogado não parta do zero. **Nada aqui é aconselhamento jurídico e nenhum destes textos deve ser assinado ou publicado como definitivo sem revisão.** As referências legais estão assinaladas *(confirmar)* onde dependem de verificação.

Titular indicado no produto: **EVOS, LDA.** (rodapé do login) — *confirmar denominação social, NIF, sede e representante.*

## Mapa

| Necessidade | Documento | Para quem | Estado |
|---|---|---|---|
| Termos de utilização claros | `frontend/content/legal/termos.ts` (publicado em `/termos`) | Utilizadores finais | Rascunho v0.1 |
| Política de privacidade clara | `frontend/content/legal/privacidade.ts` (publicado em `/privacidade`) | Utilizadores finais | Rascunho v0.1 |
| Contrato com o cliente | [`contrato-cliente-modelo.md`](contrato-cliente-modelo.md) | Empresa cliente | Esqueleto de cláusulas |
| Acordo de processamento de dados | [`acordo-processamento-dados.md`](acordo-processamento-dados.md) + [`subprocessadores.md`](subprocessadores.md) + [`medidas-de-seguranca.md`](medidas-de-seguranca.md) | Empresa cliente | Rascunho |
| Propriedade intelectual | [`propriedade-intelectual.md`](propriedade-intelectual.md) + [`licencas-terceiros.md`](licencas-terceiros.md) | Interno / advogado de PI | Plano + inventário |

Os textos de termos e privacidade vivem no frontend (e não aqui) para haver **uma única fonte**: o que o advogado aprova é exactamente o que o utilizador lê.

## Como colocar em vigor (por esta ordem)

1. Advogado revê e ajusta os documentos; preencher os campos `[ ]`.
2. Atualizar o texto em `frontend/content/legal/` e subir as versões para `1.0` em `src/legal/legal.versions.ts`.
3. Definir `LEGAL_ACCEPTANCE_REQUIRED=true` no ambiente: a partir daí cada utilizador tem de aceitar os termos e a privacidade ao entrar, e a aceitação fica registada (utilizador, versão, data, IP) em `legal_acceptances`.
4. Sempre que um texto mudar materialmente: subir a versão (obriga nova aceitação) e anotar a alteração nas Novidades.
5. Anexar DPA, subprocessadores e medidas de segurança ao contrato de cada cliente; guardar a versão assinada.

## Quem decide o quê

- **Decisão jurídica/negócio (não do programador):** responsabilidades e limites de indemnização, foro e lei aplicável, prazos de retenção finais, preço de créditos, quem é responsável pelo tratamento, base legal de cada tratamento.
- **Responsabilidade técnica (equipa):** manter `subprocessadores.md` e `medidas-de-seguranca.md` verdadeiros — são afirmações contratuais, por isso qualquer mudança (novo fornecedor, nova região, nova cifra) obriga a actualizá-los **antes** de entrar em produção.

## Funcionalidades do produto que sustentam estes documentos

| Obrigação | Onde está implementada |
|---|---|
| Direitos do titular (acesso, rectificação, eliminação, oposição) | Pedidos do titular (`DataSubjectRequest`), exportação e anonimização — módulo de privacidade (Definições → Privacidade) |
| Retenção e eliminação | Retenção automática e anonimização de ex-colaboradores (jobs agendados) |
| Prova de aceitação dos termos | `legal_acceptances` (`GET /legal/acceptances`, ADMIN/RH) |
| Registo de acessos e alterações | Auditoria append-only com cadeia de hash (módulo Auditoria) |
| Dados sensíveis em repouso | NIF/NIB cifrados (AES-256-GCM) |
| Incidente de segurança / violação de dados | `docs/deploy/gestao-incidentes.md` (SEV1) |
