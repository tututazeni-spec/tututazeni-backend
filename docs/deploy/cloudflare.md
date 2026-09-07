# Borda Cloudflare — WAF + CDN (ponto 4 da auditoria de arquitectura)

> Corrige o ponto 4 ("Utilizar WAF e, quando adequado, CDN"). Complementa o
> ponto 2 (load balancing no Caddy) e o ponto 9 (Always Online como fallback
> de leitura durante um outage do origin). Ver `docs/deploy/ha-and-spof.md`.

## Cadeia de tráfego

```
cliente ──HTTPS──► Cloudflare (WAF, CDN, anti-DDoS, rate limit)
                        │  HTTPS (Full strict), só ranges Cloudflare
                        ▼
                   VPS :443  ──►  Caddy (TLS origin + load balancer)
                                    ├──► app réplica 1  (:4000)
                                    └──► app réplica 2  (:4000)
```

O ufw do VPS (`ops/deploy/origin-firewall.sh`) só aceita 80/443 dos ranges
publicados pela Cloudflare. Quem descobrir o IP do VPS e tentar falar directo
com o Caddy é recusado no firewall — **a WAF não é contornável**.

## 1. Adicionar o site à Cloudflare

1. Dashboard Cloudflare → **Add a site** → o domínio de `DOMAIN`.
2. Plano **Free** chega para WAF gerida básica + CDN + rate limiting simples.
3. Mudar os **nameservers** do domínio para os que a Cloudflare indicar
   (no registrar). Esperar a propagação (`dig NS <domínio>`).

## 2. DNS

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| `A` | `@` (ou `innova`) | IP público do VPS | **Proxied** (nuvem laranja) |
| `A` | `www` | IP público do VPS | Proxied (se aplicável) |

O registo TEM de estar *Proxied* — é isso que faz o tráfego passar pela WAF/CDN.
Um registo "DNS only" expõe o IP de origem e salta a Cloudflare.

## 3. SSL/TLS

- **SSL/TLS → Overview → modo `Full (strict)`**. Obriga a Cloudflare a validar
  o certificado do origin. Nada abaixo de `Full (strict)` (o `Flexible` deixa o
  troço Cloudflare↔origin em HTTP — inaceitável).
- **SSL/TLS → Origin Server → Create Certificate**:
  - Deixar a Cloudflare gerar a chave e o CSR; hostnames `*.<domínio>` e `<domínio>`.
  - Validade: 15 anos.
  - Guardar o **Origin Certificate** em `/opt/innova/caddy/origin/cert.pem` e a
    **Private Key** em `/opt/innova/caddy/origin/key.pem` no VPS (`chmod 600`,
    `chown` do utilizador do compose). Ver `ops/caddy/origin/README.md`.
- **Edge Certificates → Always Use HTTPS: On**; **Minimum TLS Version: 1.2**;
  **HTTP/3: On**.
- HSTS: já é emitido pelo Caddy e pela app (`helmet`). Opcionalmente activar
  também em **Edge Certificates → HSTS** depois de o TLS estabilizar.

## 4. WAF e mitigação

- **Security → WAF → Managed rules**: activar o **Cloudflare Free Managed Ruleset**
  (OWASP-like). Nos planos pagos, activar também o *OWASP Core Ruleset* em modo
  *Managed Challenge*.
- **Security → Bots → Bot Fight Mode: On** (Free).
- **Security → Settings → Browser Integrity Check: On**; **Security Level: Medium**.
- **Security → WAF → Rate limiting rules**: uma regra
  `(<domínio>/api/auth/login)` → mais de 10 pedidos / 10 min por IP → *Block* 10 min.
  (Complementa o `ThrottlerModule` da app, que já usa Redis partilhado.)

## 5. Cache / CDN

- **Rules → Cache Rules**:
  - `URI Path starts with /api/` → **Bypass cache** (respostas da API são dinâmicas).
  - `/` e estáticos do futuro frontend (Faixa H) → **Cache Everything**,
    `Edge TTL` conforme.
- **Caching → Configuration → Always Online: On** — durante um outage total do
  VPS a Cloudflare serve a última versão em cache das páginas GET (fallback de
  leitura do ponto 9).
- **Speed → Optimization**: Brotli On.

## 6. Firewall de origem no VPS

```bash
sudo cp /opt/innova/deploy/origin-firewall.sh /usr/local/sbin/  # ou correr in-place
sudo chmod +x /opt/innova/deploy/origin-firewall.sh
sudo /opt/innova/deploy/origin-firewall.sh          # aplica agora
# cron semanal (a Cloudflare muda ranges de tempos a tempos):
echo '10 4 * * 1 root /opt/innova/deploy/origin-firewall.sh >> /var/log/innova-origin-fw.log 2>&1' \
  | sudo tee /etc/cron.d/innova-origin-fw
```

Manter a lista `trusted_proxies` do `ops/caddy/Caddyfile` em sincronia com
`https://www.cloudflare.com/ips/` (mudança rara).

## 7. Verificação

```bash
# 1. O tráfego passa pela Cloudflare (header CF-RAY presente):
curl -sI https://<domínio>/api/health/ready | grep -i cf-ray

# 2. O origin recusa acesso directo pelo IP (deve dar timeout / connection refused):
curl -m 5 -skI https://<IP-do-VPS>/api/health/ready --resolve <domínio>:443:<IP-do-VPS> \
  && echo "FALHA: origin acessível directamente" || echo "OK: origin trancado"

# 3. A WAF bloqueia um payload óbvio (deve dar 403 da Cloudflare):
curl -sI "https://<domínio>/api/?x=<script>alert(1)</script>" | head -1

# 4. Certificado de edge é da Cloudflare; SSL mode Full(strict) resolve o origin.
```

## 8. Impacto no código da app

Nenhum. O Caddy (`ops/caddy/Caddyfile`) confia no `Cf-Connecting-Ip` **apenas**
vindo dos ranges Cloudflare (`trusted_proxies static …`) e repassa o IP real no
`X-Forwarded-For`. A app mantém `trust proxy 1` (só vê o Caddy). Rate limiting,
logging de `req.ip` e auditoria continuam a ver o IP real do cliente.
