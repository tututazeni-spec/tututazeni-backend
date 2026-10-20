# Prompt para o Claude Code — Certificados: e-mail com ligação de verificação (sem PDF anexado)

## Contexto

Projeto INNOVA (backend NestJS em `tututazeni-backend`, frontend Next.js 15 App Router em `innova/frontend`, PostgreSQL + Prisma). O módulo de certificados já emite certificados em PDF ao concluir Cursos. Hoje o e-mail de entrega anexa o PDF.

## Objetivo

Alterar o e-mail de emissão do certificado para que **leve apenas uma ligação de verificação** e **não anexe o PDF**. A ligação abre uma página pública onde se confirma a autenticidade do certificado e se descarrega o PDF.

## Antes de escrever código

1. Localiza no backend o serviço que emite o certificado e o serviço/template de e-mail que o envia. Mostra-me os ficheiros encontrados.
2. Verifica o modelo Prisma do certificado: já existe um código ou token de verificação? Se não existir, propõe a migração antes de a aplicar.
3. Não alteres o gerador do PDF nem o fluxo de templates, a não ser que seja estritamente necessário para o QR code (ponto 6).

## Requisitos

### Backend (NestJS + Prisma)
1. **Código de verificação**: campo único e não sequencial no certificado (ex.: 16+ caracteres aleatórios, URL-safe, gerado com `crypto`). Para certificados já existentes, cria um script ou migração que preencha o código em falta.
2. **Estado**: garante que o certificado tem estado (válido / revogado). Se não existir, adiciona-o com valor por omissão "válido".
3. **Endpoint público** `GET /certificates/verify/:code` com `@Public()`, que devolve só o mínimo necessário: nome do participante, curso, data de conclusão, entidade emissora, estado. Sem NIF, e-mail, nota ou outros dados pessoais (minimização de dados, Lei n.º 22/11).
4. **Descarregar o PDF** através de endpoint público que valide o código, e apenas se o estado for "válido".
5. **Rate limiting** nos endpoints públicos (ex.: `@nestjs/throttler`), para impedir enumeração de códigos. Código inexistente devolve sempre a mesma resposta genérica (404).
6. **E-mail**: remove o anexo do PDF. O corpo deve ter saudação com o nome do participante, nome do curso, botão/ligação "Ver e descarregar o meu certificado" apontando para `{FRONTEND_URL}/verificar/{codigo}` e, em texto simples, o mesmo URL como alternativa. Mantém o estilo visual existente dos e-mails (navy `#0F1F3D`, dourado `#D4A017`). O URL base vem de variável de ambiente, nunca fixo no código.

### Frontend (Next.js 15 App Router)
7. Nova página pública `app/verificar/[codigo]/page.tsx`, fora do layout autenticado (sem sidebar nem guard de sessão). Mostra:
   - Certificado válido: selo de confirmação, dados do ponto 3 e botão "Descarregar PDF".
   - Certificado revogado: mensagem clara de que já não é válido.
   - Código inexistente: mensagem genérica "Certificado não encontrado".
8. Segue o design system da plataforma (navy/dourado, Plus Jakarta Sans/Inter, grelha de 8px) e é responsiva, porque a maioria abrirá a ligação no telemóvel.
9. Garante que o middleware/rotas protegidas não bloqueiam `/verificar/*`.

### Extra (opcional, mas recomendado)
10. Colocar um **QR code** no PDF a apontar para a mesma ligação de verificação, para que a versão impressa também seja verificável. Só avança se for simples no gerador atual; caso contrário, indica-me o esforço e deixa para outra iteração.

## Critérios de aceitação
- O e-mail de emissão não tem nenhum anexo.
- A ligação do e-mail abre a página pública sem login e mostra os dados corretos.
- O PDF só é descarregável com código válido e certificado não revogado.
- Códigos inválidos não revelam informação e o rate limiting está ativo.
- Certificados antigos também têm código de verificação.

## Testes e qualidade
- Testes unitários para a geração do código, o endpoint de verificação (válido, revogado, inexistente) e o serviço de e-mail (sem anexo, URL correto).
- Backend: `npm run lint:check`, `npm run format:check`, `npm run build`, `npm test`.
- Frontend: `npx eslint .`, `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, `npm run build`.
- Sem `any` no TypeScript novo.

## Entrega
Resume o que alteraste por ficheiro, indica a migração Prisma criada e as variáveis de ambiente novas (se houver). Se tiveres de fazer uma suposição, diz-me qual e porquê.
