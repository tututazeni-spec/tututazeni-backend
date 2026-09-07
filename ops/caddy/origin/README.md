# Certificado de origem (Cloudflare Origin CA)

Este directório é montado **read-only** no container `caddy`
(`./caddy/origin:/etc/caddy/origin:ro`, ver `ops/docker-compose.prod.yml`).

O Caddy espera aqui dois ficheiros — **não versionados** (`.gitignore`):

| Ficheiro | Conteúdo |
|---|---|
| `cert.pem` | Certificado Cloudflare Origin CA (PEM). Emissão: painel Cloudflare → SSL/TLS → Origin Server → Create Certificate. Validade até 15 anos. |
| `key.pem`  | Chave privada correspondente, gerada no mesmo passo. `chmod 600`. |

Modo SSL/TLS na Cloudflare tem de ser **Full (strict)** — ver
`docs/deploy/cloudflare.md`.

## Ensaio local sem Cloudflare

Para o ensaio do `docs/deploy/runbook.md` (secção 7) o Caddy não é exercitado
(o smoke bate directo em `localhost:4000`). Se precisares mesmo do Caddy a
servir localmente, gera um par self-signed para aqui:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout key.pem -out cert.pem -subj "/CN=localhost"
```
