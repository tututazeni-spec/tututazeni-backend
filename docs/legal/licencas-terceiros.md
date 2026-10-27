# Licenças de software de terceiros

> Gerado por `node scripts/license-report.js` (dependências de **produção**, directas e transitivas, a partir de `node_modules`). Regenerar antes de cada versão: `node scripts/license-report.js > /tmp/l.md` e actualizar a secção abaixo.
> Não é parecer jurídico: serve para o responsável de PI/advogado rever o que é redistribuído ou executado.

## Pontos para revisão

| Item | Situação | Acção recomendada |
|---|---|---|
| `sentry@0.45.0` — **FSL-1.1-Apache-2.0** | Dependência transitiva de `@sentry/node` → `@sentry/bundler-plugins` (ferramenta de build). A licença FSL não é open source: proíbe usar o software para concorrer com o Sentry durante 2 anos, depois converte para Apache-2.0. O nosso uso é como ferramenta, não como produto concorrente. | Advogado confirma que o uso não é restrito; ou excluir o plugin de bundler (não é usado em runtime). |
| `jszip` — MIT **OR** GPL-3.0-or-later | Licença dupla: aplicamos a opção **MIT**. | Registar a escolha MIT; nenhuma acção. |
| `dompurify` — MPL-2.0 **OR** Apache-2.0 | Licença dupla: aplicamos **Apache-2.0**. | Nenhuma. |
| `@img/sharp-win32-x64` — Apache-2.0 AND **LGPL-3.0-or-later** | Binário nativo do `sharp` (libvips) só em Windows/dev; em Linux/produção entra o equivalente `linux`. LGPL exige permitir a substituição da biblioteca e manter o aviso. | Manter o pacote como dependência dinâmica (como está), incluir o aviso de LGPL nas notas de terceiros do produto. |
| `elkjs` — EPL-2.0 | Vem de `prisma` → `@prisma/studio-core`; é ferramenta de desenvolvimento (Prisma Studio), não é distribuída ao cliente. | Nenhuma, se `prisma` ficar fora da imagem de produção. |
| `buffers@0.1.1`, `pause@0.0.1` | Sem campo `license` no `package.json`. Os repositórios de origem indicam MIT, mas **não verificado aqui**. | Confirmar no repositório de cada um e acrescentar a `VERIFIED` em `scripts/license-report.js`. |
| `png-js@1.1.0` | Sem campo `license`, mas o pacote traz ficheiro `LICENSE` (MIT). | Já tratado no script. |

## Inventário

### innova — 531 pacotes de produção

| Licença | Pacotes |
|---|---|
| MIT | 407 |
| ISC | 47 |
| Apache-2.0 | 37 |
| BSD-3-Clause | 14 |
| BlueOak-1.0.0 | 5 |
| BSD-2-Clause | 4 |
| Unlicense | 3 |
| DESCONHECIDA | 2 |
| MIT/X11 | 2 |
| 0BSD | 1 |
| EPL-2.0 | 1 |
| MIT and ISC | 1 |
| MIT (ficheiro LICENSE do pacote) | 1 |
| (MIT AND Zlib) | 1 |
| MIT-0 | 1 |
| (MIT OR GPL-3.0-or-later) | 1 |
| FSL-1.1-Apache-2.0 | 1 |
| (MIT OR CC0-1.0) | 1 |
| Python-2.0 | 1 |

**Licença "source-available" (não é open source: ler os termos)**

- sentry@0.45.0 — FSL-1.1-Apache-2.0

**Copyleft fraco (obrigações apenas sobre alterações ao próprio pacote)**

- elkjs@0.11.1 — EPL-2.0

**Sem licença identificável (verificar manualmente)**

- buffers@0.1.1 — DESCONHECIDA
- pause@0.0.1 — DESCONHECIDA

### frontend — 206 pacotes de produção

| Licença | Pacotes |
|---|---|
| MIT | 170 |
| Apache-2.0 | 12 |
| ISC | 6 |
| BSD-3-Clause | 4 |
| 0BSD | 2 |
| BSD-2-Clause | 2 |
| MIT-0 | 2 |
| (Apache-2.0 AND BSD-3-Clause) | 1 |
| (MIT OR GPL-3.0-or-later) | 1 |
| (MIT AND Zlib) | 1 |
| Apache-2.0 AND LGPL-3.0-or-later | 1 |
| CC-BY-4.0 | 1 |
| BlueOak-1.0.0 | 1 |
| CC0-1.0 | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |

**Copyleft fraco (obrigações apenas sobre alterações ao próprio pacote)**

- @img/sharp-win32-x64@0.34.5 — Apache-2.0 AND LGPL-3.0-or-later
- dompurify@3.4.10 — (MPL-2.0 OR Apache-2.0)
