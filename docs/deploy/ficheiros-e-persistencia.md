# Ficheiros e uploads — onde ficam e porque sobrevivem a um deploy

> O disco de um contentor é efémero: redeploy, rollback, `--scale` ou restart do VPS criam
> contentores novos e o que lá estava desaparece. Por isso nenhum dado do utilizador pode viver
> só no disco da app.

## O que a aplicação faz hoje

Auditado em 2026-10-27: **nenhum serviço em `src/` escreve ficheiros de utilizador em disco**
(sem `writeFile`, `createWriteStream`, `diskStorage` ou `dest:` fora de testes). Há dois caminhos:

| Caminho | Onde fica o ficheiro | Como se protege |
|---|---|---|
| Ficheiros enviados inline como data URL base64 (validados em `src/common/files/`; o limite por tipo está em `file-policies.ts`) | Data URL base64 **na própria BD** (Postgres gerido) | PITR do provider + `pg_dump` cifrado diário para S3 |
| Ficheiros já guardados fora da app (`fileUrl` HTTPS, até `REMOTE_FILE_MAX_BYTES` = 200 MiB) | **Storage externo** (R2/S3); a BD só guarda o `fileUrl` | Versionamento/replicação do bucket; a app valida o host (`ALLOWED_FILE_HOST`) e verifica o conteúdo (`REMOTE_FILE_VERIFY`) |

Tudo o que o contentor escreve em disco é descartável (logs com rotação, `/tmp`).
Volumes nomeados do compose existem só para Prometheus, Alertmanager, Redis (AOF) e Caddy.

## Regras

1. Funcionalidade nova com upload **não** usa `multer.diskStorage`/`fs.writeFile` para dados do
   utilizador: usa o caminho de data URL (pequeno) ou `fileUrl` externo (grande).
2. O bucket tem de ter **versionamento** (recuperar um ficheiro apagado/trocado) e, de preferência,
   política de retenção. Não é coberto pelo `pg_dump`: a BD só guarda o URL.
3. `STORAGE_BASE_URL` e `ALLOWED_FILE_HOST` têm de apontar ao bucket/CDN real. O
   `npm run preflight:golive` falha se forem `localhost` ou valores de exemplo.
4. Os custos de armazenamento por cliente são controlados pela quota de storage do plano de
   faturação (`billing`), não pelo disco do VPS.

## Criar o bucket

`ops/infra/files-bucket/` (Terraform): versionamento, SSE-S3, acesso público bloqueado, CORS só para o
frontend, versões antigas recuperáveis 90 dias e `prevent_destroy`.

```bash
cd ops/infra/files-bucket && terraform init
terraform plan -var 'allowed_origins=["https://app.innova.ao"]' -out=tfplan && terraform apply tfplan
```

Servir pela CDN (Cloudflare) com o bucket como origem; `STORAGE_BASE_URL`, `ALLOWED_FILE_HOST` e
`IMG_ALLOWED_HOSTS` levam o domínio da CDN.

## Verificação

- Ensaio de persistência: carregar um ficheiro de cada caminho, fazer `docker compose up -d --force-recreate app`
  e abrir o ficheiro outra vez. Tem de continuar acessível.
- Restauro: o `restore-drill.sh` mensal repõe a BD (incluindo as data URLs); o bucket restaura-se
  pelo versionamento do provider.

## Checklist

- [ ] Bucket criado com versionamento e acesso só por URLs assinados/CDN
- [ ] `STORAGE_BASE_URL`, `ALLOWED_FILE_HOST`, `IMG_ALLOWED_HOSTS` com o domínio real
- [ ] `preflight:golive` sem `FALHA` nos pontos de storage
- [ ] Ensaio de persistência feito uma vez após o primeiro deploy
