# Entrega de emails — passos manuais (Carrinho SA)

Estes passos são feitos fora do código. O código só envia para `nome.apelido@carrinho-sa.com`;
chegar à Caixa de Entrada do Outlook depende da configuração abaixo.

## O que o código faz

- Todo o envio de emails da plataforma passa por `src/mail/mail.service.ts` (SMTP).
- O SMTP configura-se no ecrã **Definições → Integrações** (tem prioridade); sem isso usam-se
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`.
- Cada envio regista no log o `messageId`, o nº de destinatários aceites/rejeitados, ou o erro.
- Exceção deliberada: o "email de teste" das Definições (`integration-settings.service.ts#testSmtp`
  e `email-settings.service.ts`) envia directamente, porque testa uma configuração que pode ainda
  não estar guardada e tem de devolver o erro SMTP ao ecrã.
- Emails de certificado levam só a ligação de verificação, nunca o PDF.

## Formato do email por tenant

Em **Definições → Visão Geral → Formato de email**:

| Campo            | Carrinho SA               |
| ---------------- | ------------------------- |
| Domínio          | `carrinho-sa.com`         |
| Padrão           | `{primeiroNome}.{apelido}` |
| Modo             | `Sugerir` (por defeito) ou `Obrigar` |

`Sugerir` aceita e avisa; `Obrigar` rejeita. Decisão pendente do dono do produto.
"Apelido" = último nome até o cliente confirmar o critério para nomes compostos.

## 1. Cloudflare (domínio de envio da INNOVA)

Configurar no DNS do domínio que aparece no remetente (`SMTP_FROM` / campo "De" nas Definições):

- **SPF** — registo TXT que autoriza o servidor SMTP escolhido (o fornecedor indica o valor `include:`).
- **DKIM** — registo(s) TXT/CNAME fornecidos pelo fornecedor SMTP.
- **DMARC** — TXT em `_dmarc.<domínio>`, por exemplo `v=DMARC1; p=none; rua=mailto:<caixa-de-relatórios>`.
  Começar em `p=none` e subir para `quarantine` depois de confirmar que tudo passa.

Sem isto o Outlook tende a enviar para o Lixo ou rejeitar. É o ponto mais importante.

## 2. Com o TI da Carrinho SA

- Adicionar o domínio de envio da INNOVA à lista de remetentes seguros (*allow list*) no Microsoft 365.
- Confirmar que todas as caixas de correio dos colaboradores existem e estão activas.

## 3. Teste de aceitação (2 ou 3 colaboradores)

1. Uma notificação normal.
2. Uma recuperação de palavra-passe.
3. Um email de certificado com ligação de verificação.

Verificar que chegam à **Caixa de Entrada** (não ao Lixo) e que, nos cabeçalhos da mensagem
(Outlook → Ficheiro → Propriedades), `spf`, `dkim` e `dmarc` aparecem como `pass`.
