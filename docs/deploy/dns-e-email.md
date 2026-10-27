# Domínio, DNS e e-mail (SPF, DKIM, DMARC)

> Sem isto, os e-mails de convite e de reset de password vão para o spam (ou são rejeitados) e
> qualquer pessoa pode enviar e-mail em nome do domínio. Verificação automática:
> `npm run ops:dns-check` (só de leitura).

## 1. Registos do domínio da aplicação

| Registo | Valor | Notas |
|---|---|---|
| `A`/`AAAA` `app.<dominio>` | IP do VPS | **Proxied** (nuvem laranja) no Cloudflare: o `origin-firewall.sh` só aceita os ranges da Cloudflare |
| `CAA` `<dominio>` | `0 issue "letsencrypt.org"` e/ou `0 issue "pki.goog"` | Limita quem pode emitir certificados (o certificado de origem é o Origin CA da Cloudflare) |
| SSL/TLS Cloudflare | *Full (strict)* + *Always Use HTTPS* + HSTS | Já descrito em `cloudflare.md` |

`ALLOWED_ORIGINS`, `FRONTEND_URL`, `APP_URL` têm de usar exactamente este domínio.

## 2. E-mail: três registos, três funções

O domínio do `SMTP_FROM` (ex.: `innova.ao`) tem de publicar:

1. **SPF** — quem pode enviar. TXT em `<dominio>`, **um único** registo:
   `v=spf1 include:<fornecedor-smtp> -all`
   (o `include:` vem do fornecedor: Brevo, Mailgun, Google Workspace…). Termina sempre em `-all`
   (ou `~all` durante o arranque). Nunca `+all`. Mais de um registo `v=spf1` invalida o SPF.
2. **DKIM** — assinatura. O fornecedor dá um *selector* e um CNAME/TXT em
   `<selector>._domainkey.<dominio>`. Activar a assinatura no painel do fornecedor depois de publicar.
3. **DMARC** — o que fazer quando SPF/DKIM falham. TXT em `_dmarc.<dominio>`:
   `v=DMARC1; p=none; rua=mailto:dmarc@<dominio>; adkim=s; aspf=s`

Rampa DMARC: `p=none` (2–4 semanas a ler os relatórios `rua`) → `p=quarantine` → `p=reject`.
Só subir quando os relatórios mostrarem que todo o e-mail legítimo (app, RH, helpdesk) passa.

Também: **MX** do domínio a apontar para a caixa real (`SUPPORT_EMAIL` é monitorizada em horário útil),
e registo **PTR** do IP de envio se se usar SMTP próprio (com fornecedor externo não é preciso).

## 3. Variáveis (`.env.production`)

| Variável | Quem lê | Nota |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | **A aplicação** (`src/mail/mail.service.ts`) | O remetente tem de ser do domínio com SPF/DKIM/DMARC |
| `SMTP_PASSWORD`, `ALERT_EMAIL_TO` | **Alertmanager** (renderizado pelo `deploy.sh`) | Nome diferente de propósito; ambas têm de estar preenchidas |

O SMTP guardado em Definições → E-mail tem prioridade sobre estas variáveis.

## 4. Verificação

```bash
DNS_APP_HOST=app.innova.ao MAIL_DOMAIN=innova.ao DKIM_SELECTORS=<selector> npm run ops:dns-check
```

`FALHA` bloqueia o go-live (SPF/DMARC em falta ou inválidos, DKIM sem registo, domínio de exemplo);
`AVISO` é recomendação (ex.: `p=none`, sem `rua`). Depois de passar, enviar um convite real para uma
caixa Gmail e uma Outlook, abrir "Mostrar original" e confirmar `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

## 5. Checklist

- [ ] `A`/`AAAA` proxied; `CAA` publicado
- [ ] SPF único e a terminar em `-all`/`~all`
- [ ] DKIM activo no fornecedor e registo publicado
- [ ] DMARC com `rua` a chegar a uma caixa lida por alguém
- [ ] `npm run ops:dns-check` sem `FALHA`
- [ ] Convite de teste recebido na caixa de entrada (não no spam) em Gmail e Outlook
