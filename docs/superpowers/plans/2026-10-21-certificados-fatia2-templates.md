# Certificados — Fatia 2: Nove templates, editor e versionamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, escolhido pelo utilizador). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Biblioteca de **exactamente nove templates** visualmente distintos, todos sobre o mesmo motor de geração, personalizáveis (logótipo, fundo, cores, textos com variáveis, assinatura, posição/tamanho/alinhamento, QR e código), com pré-visualização antes de guardar e versionamento que nunca altera retroactivamente certificados já emitidos.

**Architecture:** Cada template é uma **configuração JSON** (`TemplateConfig`) interpretada por um motor único: um construtor de *plano de desenho* puro (`buildLayoutPlan`) devolve operações (texto, rectângulo, linha, polígono, círculo, imagem, QR) e um desenhador pdfkit executa-as. Os nove layouts são nove funções que acrescentam decoração diferente ao mesmo conjunto de blocos de conteúdo. Guardar um template cria uma **nova versão imutável**; cada certificado emitido embute no seu `snapshot` o template resolvido (id, versão, configuração e ids de imagens), por isso mudanças posteriores não o afectam. Imagens ficam num armazém controlado (`CertificateAsset`, imutável, acesso por papel).

**Tech Stack:** NestJS, Prisma, pdfkit, qrcode, Jest (unit + `test/integration`); Next.js, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-certificados-design.md` (§4 de `docs/prompt_certificados_claude_code.md`). Fatias 1, 3, 4 e 5 já entregues.

**Fora desta fatia:** criar templates novos além dos nove (a edição de um dos nove gera versões; não há "duplicar"); assinatura digital criptográfica (a imagem de assinatura é um elemento gráfico — fica dito na interface); imagens por ligação externa (não se descarrega nada de URLs: só ficheiros carregados).

## Global Constraints

- Mesmas das fatias anteriores (campos Prisma confirmados, DTOs com class-validator, autorização no backend com `Role`, commits locais PT com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, nunca push/merge, migração manual aditiva com timestamp > `20261121000000`, prettier só nos ficheiros alterados do backend e nunca em pastas inteiras do frontend que não sejam minhas).
- **Exactamente 9 templates de sistema** (`isSystem = true`, ids fixos `tpl-1-corporativo-classico` … `tpl-9-premium-moldura`); templates antigos criados em Definições ficam fora da biblioteca (não são seleccionáveis em regras nem listados). Gestão (editar, carregar imagens): **ADMIN e RH**; AUDITOR só lê e pré-visualiza.
- **Imutabilidade:** cada versão é uma linha própria; o `snapshot` do certificado embute `template: { id, version, config }`. Reemissão mantém o template do original. Imagens nunca são alteradas nem apagadas (um novo upload cria um novo `CertificateAsset`).
- **Variáveis** (lista fechada): `nome_completo`, `nome_curso`, `nome_formacao`, `nome_trilha`, `nome_empresa`, `nome_instrutor`, `carga_horaria`, `nota_final`, `data_emissao`, `data_validade`, `codigo_certificado`, `competencias_adquiridas`, `assinatura_responsavel`, `qr_code`. Em tempo de guardar, uma variável fora da lista → 400 com a lista das válidas. Em tempo de emissão **nunca** sai `{{…}}`: variável sem valor é removida e, se a linha só tinha variáveis opcionais em falta (`nota_final`, `data_validade`, `nome_instrutor`, `competencias_adquiridas`, `carga_horaria`), a linha inteira é omitida.
- **Imagens:** só PNG ou JPEG carregados (data URL base64), validados por tipo declarado **e** pelos bytes iniciais (assinatura do ficheiro); máx. 2 MB; logótipo/assinatura ≤ 4000×4000 px e fundo ≤ 6000×6000 px; guardados em `CertificateAsset` (BYTEA). Servidos só a ADMIN/RH/AUDITOR (para o editor); o PDF final embute-as.
- **Configuração:** cores só `#RRGGBB`; textos ≤ 300 caracteres cada (título ≤ 120); `dx/dy` ∈ [−0.15, 0.15], `scale` ∈ [0.6, 1.5], `align` ∈ left|center|right; elementos desconhecidos rejeitados (`forbidNonWhitelisted`); contraste mínimo texto/fundo (rácio ≥ 3:1) validado ao guardar para evitar certificados ilegíveis.
- Fontes standard do pdfkit (Helvetica/Times/Courier, Latin-1): caracteres fora do intervalo são removidos (como em `certificate-renderer.ts`).
- Frontend: `AlertCard`, `QueryError`, `EmptyState`, `Modal`, rótulos em português sem enums crus, pré-visualização por `<iframe>` de blob (revogação diferida), cor de acção navy `#0F1F3D`.

## Review Focus

- Editar o template (v2) e voltar a descarregar um certificado emitido com a v1 → o PDF/plano de desenho é **idêntico** ao original; um certificado novo usa a v2.
- `{{variavel_inexistente}}` ao guardar → 400; certificado sem nota/validade/instrutor emitido com um texto que as referencia → sem `{{`, sem "Nota:" vazio, sem linha órfã.
- Nome do titular com 200+ caracteres, acentos e emoji em cada um dos nove layouts → PDF válido, texto dentro da página (sem coordenadas fora de 0..largura/altura).
- Upload de ficheiro `.exe` renomeado para `.png`, SVG, GIF, PNG corrompido, 3 MB, ou `data:` com MIME enganador → 400; colaborador/gestor a carregar ou a ler imagens → 403.
- Cores com texto claro sobre fundo claro (contraste < 3:1) → 400 com mensagem; `dx = 5` (fora da página) → 400.
- Dois administradores a guardar o mesmo template ao mesmo tempo → versões 2 e 3 distintas, sem versão duplicada nem perdida (restrição única `[templateId, version]` + retry).
- A biblioteca devolve exactamente 9 mesmo depois de chamadas repetidas e concorrentes (criação idempotente); templates legados não aparecem.

## File Structure

- Modify `prisma/schema.prisma` + `prisma/migrations/20261122000000_certificate_templates_v2/migration.sql`; `src/test-mocks/prisma-client.mock.js` (se houver enums novos).
- Create `src/certificates/templates/`: `template-variables.ts`, `template-config.ts` (tipos + validação + contraste), `builtin-templates.ts` (9 definições), `layout-plan.ts` (tipos de operações + blocos comuns), `layouts/layout-1.ts … layout-9.ts`, `plan-renderer.ts` (executa o plano com pdfkit), `image-validation.ts`, `certificate-assets.service.ts`, `certificate-templates.service.ts`, `certificate-templates.dto.ts` (+ specs).
- Modify `src/certificates/certificate-renderer.ts` (delegar no motor novo; layout 1 = aparência actual), `certificate-issuance.service.ts` (resolver template e embutir no snapshot), `certificate-lifecycle.service.ts` (reemissão mantém o template), `certificates.service.ts` (usa o template do snapshot), `certificates-admin.service.ts` (`templates()` passa a devolver a biblioteca nova), `certificates.controller.ts`, `certificates.module.ts`, `certificates-admin.dto.ts`/`certificate-rules.service.ts` (`templateId` na regra).
- Frontend: create `components/certificates/{TemplateGallery,TemplateEditorModal,TemplatePreviewModal,ImageUploadField,VariableChips}.tsx`, `templateLabels.ts`; modify `TemplatesTab.tsx`, `RulesTab.tsx`, `types.ts`, `labels.ts`; testes ao lado.

---

### Task 1: Schema — versões, imagens e metadados do template

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20261122000000_certificate_templates_v2/migration.sql`; Test `test/integration/certificates/certificates-templates-schema.integration-spec.ts`.

**Interfaces:** Produces: em `CertificateTemplate`: `isSystem Boolean @default(false)`, `layoutKey String?`, `config String? @db.Text`, `currentVersion Int @default(0)`, relação `versions CertificateTemplateVersion[]`; modelo `CertificateTemplateVersion { id String @id @default(cuid()); templateId String; version Int; config String @db.Text; createdById Int?; createdAt DateTime @default(now()); @@unique([templateId, version]); @@index([templateId]) }` (FK ON DELETE CASCADE); modelo `CertificateAsset { id String @id @default(cuid()); kind CertificateAssetKind; mime String; size Int; width Int; height Int; data Bytes; createdById Int?; createdAt DateTime @default(now()) }` com enum `CertificateAssetKind { LOGO BACKGROUND SIGNATURE }`.

- [ ] **Step 1: Test (Postgres real)** — cria um template, duas versões (1 e 2) e confirma que repetir a versão 2 dá `P2002`; cria um asset com bytes e relê-os iguais; `isSystem` por omissão `false`.
- [ ] **Step 2: Run** (`NODE_OPTIONS=--max-old-space-size=8192`, `--runInBand`, segundo plano) → FAIL. **Step 3: Implement** schema + migração manual + enum no mock Jest. **Step 4: Run** → PASS (a migração aplica-se via `globalSetup`).
- [ ] **Step 5: Commit** `feat(certificates): schema de versões e imagens dos templates`.

### Task 2: Motor de variáveis

**Files:** Create `src/certificates/templates/template-variables.ts`; Test `template-variables.spec.ts`.

**Interfaces:** Produces
```ts
export const TEMPLATE_VARIABLES: readonly string[]            // lista fechada (ver Global Constraints)
export const OPTIONAL_VARIABLES: readonly string[]            // nota_final, data_validade, nome_instrutor, competencias_adquiridas, carga_horaria, nome_trilha
export function findUnknownVariables(text: string): string[]
export type VariableValues = Partial<Record<string, string | undefined>>
export function renderVariables(text: string, values: VariableValues): string | null   // null = linha a omitir
export function renderParagraph(text: string, values: VariableValues): string[]        // por linha; omite as nulas
```
Regra: `{{ nome }}` com espaços aceite; `findUnknownVariables` ignora maiúsculas/minúsculas? Não — nomes exactos em minúsculas. `renderVariables`: substitui cada variável por `values[nome]` (texto simples, sem interpretar o valor como template — um nome `{{nome_curso}}` dentro do valor não é re-expandido); se alguma variável opcional da linha ficar sem valor → a linha só é omitida quando, depois de remover as variáveis em falta, não sobrar texto com letras ou números; caso contrário remove só a variável e normaliza espaços/pontuação solta (`" — "` à beira, vírgulas duplas). Variável obrigatória sem valor → vazia (a camada de emissão garante valores). `assinatura_responsavel` e `qr_code` são marcadores de bloco (resolvem para string vazia no texto; o desenho trata-os à parte).

- [ ] **Step 1: Tests** — conhecidas passam e `{{foo}}`/`{{ NOME_CURSO }}` são devolvidas por `findUnknownVariables`; substituição simples; valor que contém `{{nome_curso}}` não é re-expandido; linha "Nota final: {{nota_final}}" sem nota → `null`; "Concluiu {{nome_curso}} com nota {{nota_final}}." sem nota → "Concluiu X com nota." sem espaço duplo (ou `Concluiu X.`); "Válido até {{data_validade}}" sem validade → `null`; texto sem variáveis intacto; `renderParagraph` parte em linhas e omite as nulas; nunca devolve `{{`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): motor de variáveis dos templates`.

### Task 3: Configuração, validação e os nove templates de origem

**Files:** Create `src/certificates/templates/template-config.ts`, `builtin-templates.ts`; Test `template-config.spec.ts`, `builtin-templates.spec.ts`.

**Interfaces:** Produces
```ts
export type Align = 'left' | 'center' | 'right'
export interface ElementTweak { align?: Align; scale?: number; dx?: number; dy?: number; visible?: boolean }
export type ElementKey = 'logo' | 'title' | 'recognition' | 'name' | 'course' | 'details' | 'signature' | 'qr' | 'code'
export interface TemplateConfig {
  layoutKey: LayoutKey                         // 1..9, ver LAYOUT_KEYS
  colors: { primary: string; accent: string; text: string; background: string }
  texts: { title: string; recognition: string; courseLine: string; detailsLine: string; footer: string }
  assets: { logoId?: string; backgroundId?: string; signatureId?: string }
  signatory: { name?: string; title?: string }
  options: { showQr: boolean; showCode: boolean; showHours: boolean; showValidity: boolean; showScore: boolean }
  elements: Partial<Record<ElementKey, ElementTweak>>
}
export const LAYOUT_KEYS = ['corporativo-classico','moderno-minimalista','executivo-premium','institucional-formal','tecnologico-contemporaneo','elegante-geometrico','academico-tradicional','faixa-lateral','premium-moldura'] as const
export function validateTemplateConfig(input: unknown): { ok: true; config: TemplateConfig } | { ok: false; errors: string[] }
export function contrastRatio(hexA: string, hexB: string): number      // WCAG
export const BUILTIN_TEMPLATES: readonly { id: string; name: string; description: string; config: TemplateConfig }[]  // 9, ids fixos
```
`validateTemplateConfig` aplica os limites do Global Constraints (cores `#RRGGBB`, comprimentos, `dx/dy/scale`, `align`, chaves de elemento desconhecidas, variáveis desconhecidas via `findUnknownVariables`, contraste `text`×`background` ≥ 3 e `primary`×`background` ≥ 1.5); devolve **todos** os erros em português. Os nove `BUILTIN_TEMPLATES` têm `layoutKey` distintos, nomes únicos (os nove conceitos do prompt), textos por omissão com variáveis (ex.: `recognition: "Certificamos que {{nome_completo}} concluiu com aproveitamento"`, `courseLine: "{{nome_curso}}"`, `detailsLine: "Carga horária: {{carga_horaria}} · Nota: {{nota_final}} · Emitido em {{data_emissao}} · Válido até {{data_validade}}"`), e passam todos em `validateTemplateConfig`.

- [ ] **Step 1: Tests** — config válida passa; `#12345` e `red` rejeitadas; título de 121 caracteres, `dx: 0.5`, `scale: 3`, `align: 'justify'`, elemento `foo`, `{{inventada}}`, texto claro sobre fundo claro (`#FFFFFF`/`#FAFAFA`) → erros (e vários erros juntos são todos devolvidos); `contrastRatio('#000000','#FFFFFF')` ≈ 21 e `('#777777','#888888')` < 3; os `BUILTIN_TEMPLATES` são **9**, com `layoutKey` e `id` distintos e todos válidos.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): configuração validada e nove templates de origem`.

### Task 4: Plano de desenho e os nove layouts

**Files:** Create `src/certificates/templates/layout-plan.ts`, `layouts/layout-1.ts` … `layout-9.ts`, `layouts/index.ts`; Test `layouts.spec.ts`.

**Interfaces:** Produces
```ts
export type Op =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lineWidth?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; lineWidth: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; lineWidth?: number }
  | { kind: 'polygon'; points: [number, number][]; fill: string }
  | { kind: 'text'; text: string; x: number; y: number; w: number; size: number; font: 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Times-Bold' | 'Times-Italic' | 'Courier'; color: string; align: Align }
  | { kind: 'image'; asset: 'logo' | 'background' | 'signature'; x: number; y: number; w: number; h: number; fit: boolean }
  | { kind: 'qr'; x: number; y: number; size: number }
export const PAGE = { w: 841.89, h: 595.28 }                      // A4 horizontal
export interface RenderData { values: VariableValues; hasLogo: boolean; hasBackground: boolean; hasSignature: boolean; verifyUrl: string }
export function buildLayoutPlan(config: TemplateConfig, data: RenderData): Op[]
```
`buildLayoutPlan` escolhe a função do `layoutKey`; todas partilham o mesmo conjunto de **blocos de conteúdo** (título, texto de reconhecimento, nome, linha do curso, linha de detalhes, assinatura + nome/cargo, QR + código, rodapé) e as mesmas regras de tweak (`place(elementKey, base)` aplica `align/scale/dx/dy/visible` e limita a caixa à página). O que muda por layout é só a **decoração e a composição** (ver conceitos 1–9 do prompt: clássico de dupla moldura; minimalista com linha de acento e muito espaço; executivo com fundo escuro e dourado; institucional com faixa superior e selo; tecnológico com polígonos angulares e Courier nos metadados; geométrico com cantos triangulares e losango separador; académico com moldura ornamentada e selo; faixa lateral vertical com logótipo e QR; premium com moldura grossa dupla, ornamentos nos cantos e fita para o nome do curso). Texto só com linhas resolvidas por `renderParagraph` (nunca `{{`). O fundo (`backgroundId`) é a primeira operação quando existe; o logótipo e a assinatura só entram se houver imagem. Layout 1 reproduz a aparência actual de `certificate-renderer.ts`.

- [ ] **Step 1: Tests (sem PDF, sobre o plano)** — para cada um dos 9 layouts, com dados completos: nenhum `Op` de texto contém `{{`; todos os rectângulos/texto/imagem/QR caem dentro de `PAGE` (tolerância 1pt) mesmo com `dx/dy` extremos válidos; o nome completo aparece uma vez; com dados esparsos (sem nota, validade, instrutor, horas) não existe nenhum texto com "Nota", "Válido até" nem "Carga horária" e nenhuma linha vazia; `showQr:false` remove o QR e `showCode:false` remove o código; `elements.signature.visible:false` remove assinatura; sem `signatureId` não há `image` de assinatura mas o nome/cargo continuam; os nove layouts produzem **assinaturas de operações distintas** (conjunto de tipos+contagens+cores diferente entre todos os pares) — prova de "visualmente distintos"; nome com 200+ caracteres/emoji/acentos produz texto truncado (≤ 120) dentro da caixa; `scale: 1.5` não ultrapassa a página.
- [ ] **Step 2: Run** `npx jest src/certificates/templates/layouts` → FAIL. **Step 3: Implement** (helpers comuns em `layout-plan.ts`, um ficheiro por layout, cada um ≤ ~150 linhas). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): plano de desenho e nove layouts`.

### Task 5: Desenhador pdfkit e validação de imagens

**Files:** Create `src/certificates/templates/plan-renderer.ts`, `image-validation.ts`; Modify `src/certificates/certificate-renderer.ts`; Test `plan-renderer.spec.ts`, `image-validation.spec.ts`, `certificate-renderer.spec.ts` (alargar).

**Interfaces:** Produces
```ts
export function renderPlanToPdf(plan: Op[], assets: { logo?: Buffer; background?: Buffer; signature?: Buffer }, qrPng: Buffer): Promise<Buffer>
export function inspectImage(dataUrl: string): { ok: true; mime: 'image/png' | 'image/jpeg'; bytes: Buffer; width: number; height: number } | { ok: false; error: string }
export async function renderCertificatePdf(snapshot: CertificateSnapshot, verifyUrl: string): Promise<Buffer>   // assinatura mantida; lê snapshot.template quando existe
```
`inspectImage`: só `data:image/png;base64,` ou `data:image/jpeg;base64,`; confere que o MIME declarado coincide com os bytes iniciais (PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`) e lê as dimensões do cabeçalho (IHDR / SOF0-2); rejeita > 2 MB, base64 inválido, SVG/GIF/WebP, ficheiro truncado e dimensões acima dos limites (logótipo/assinatura 4000, fundo 6000 — o chamador passa o limite). `CertificateSnapshot` passa a aceitar `template?: { id: string; version: number; config: TemplateConfig; assets?: Record<string, string> }` (assets = base64 embutido **só no momento de desenhar**, carregado de `CertificateAsset` por id, não guardado no snapshot). Sem `snapshot.template` (certificados antigos) usa o `BUILTIN_TEMPLATES[0]` — aparência clássica actual.

- [ ] **Step 1: Tests** — `inspectImage`: PNG/JPEG válidos mínimos devolvem dimensões correctas; `.exe` com MIME png → erro; SVG, GIF, WebP → erro; 3 MB → erro; PNG truncado → erro; MIME `image/png` com bytes JPEG → erro; `renderPlanToPdf` devolve `%PDF-` para cada layout com dados completos e esparsos (usar o plano real dos nove); `renderCertificatePdf` com snapshot antigo (sem `template`) continua a gerar PDF; com `template` v1 vs v2 geram planos diferentes mas o snapshot com v1 gera sempre o mesmo plano (determinístico).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): desenhador PDF e validação segura de imagens`.

### Task 6: Serviços de templates e de imagens

**Files:** Create `src/certificates/templates/certificate-assets.service.ts`, `certificate-templates.service.ts`, `certificate-templates.dto.ts`; Test `certificate-assets.service.spec.ts`, `certificate-templates.service.spec.ts`.

**Interfaces:** Consumes Tasks 2–5, `AuditService.log`. Produces
```ts
CertificateAssetsService.upload(dto: { kind: 'LOGO' | 'BACKGROUND' | 'SIGNATURE'; file: string }, actorId: number): Promise<{ id: string; kind: string; mime: string; width: number; height: number; size: number }>
CertificateAssetsService.read(id: string): Promise<{ mime: string; data: Buffer }>        // 404 se não existe
CertificateTemplatesService.list(): Promise<TemplateSummary[]>                            // exactamente 9; garante a criação idempotente
CertificateTemplatesService.get(id: string): Promise<TemplateDetail>                       // config actual + versões
CertificateTemplatesService.saveVersion(id: string, input: unknown, actorId: number): Promise<TemplateDetail>   // valida; cria versão n+1
CertificateTemplatesService.preview(input: unknown): Promise<Buffer>                       // PDF com dados de exemplo; nada é gravado
CertificateTemplatesService.resolveForIssuance(templateId?: string | null): Promise<{ id: string; version: number; config: TemplateConfig }>
```
`list`: se faltarem sistemas, cria os 9 com `createMany({ skipDuplicates: true })` (fixos, `isSystem:true`, versão 1 = config de origem); depois devolve só `isSystem:true`, ordenados por `layoutKey`. `saveVersion`: `validateTemplateConfig` (erros → `BadRequestException` com a lista), confirma que cada `assets.*Id` existe e é do `kind` certo (404/400), `layoutKey` não pode mudar (cada template mantém o seu layout), calcula `version = currentVersion + 1` numa transacção e insere a versão; em `P2002` repete até 3 vezes lendo de novo `currentVersion`; actualiza `config/currentVersion`; audita `CERTIFICATE_TEMPLATE_SAVED` (strict, `{ templateId, version }`). `resolveForIssuance(undefined)` → template 1 (clássico). Dados de exemplo da pré-visualização: nome "Maria da Conceição Almeida", curso, 40 h, nota 87, datas, instrutor, empresa. Upload: `kind` e dimensões por tipo; guarda `Bytes`; audita `CERTIFICATE_ASSET_UPLOADED`.

- [ ] **Step 1: Tests (Prisma mockado)** — `list` chama `createMany` com os 9 ids fixos e `skipDuplicates`, e devolve 9 mesmo com linhas legadas `isSystem:false` na BD; `saveVersion`: config inválida → 400 com todos os erros; mudar `layoutKey` → 400; asset inexistente → 404; asset de outro `kind` → 400; sucesso incrementa a versão (v1 → v2) e audita; `P2002` na 1.ª tentativa repete e fica v3 (sem duplicar nem perder); `preview` não escreve na BD; `resolveForIssuance` desconhecido → 404 e `undefined` → clássico; `upload` rejeita MIME enganador (reusa `inspectImage`) e persiste os bytes; `read` desconhecido → 404.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(certificates): serviços de templates, versões e imagens`.

### Task 7: Emissão, reemissão e download usam o template do snapshot

**Files:** Modify `src/certificates/certificate-issuance.service.ts`, `certificate-lifecycle.service.ts`, `certificates.service.ts`, `certificate-rules.service.ts`, `certificates-admin.dto.ts`; Test os specs respectivos + `certificate-issuance.service.spec.ts`.

**Interfaces:** Consumes `CertificateTemplatesService.resolveForIssuance`, `CertificateAssetsService.read`. Produces: `issue()` resolve o template de `rule.templateId` (regra implícita → clássico) e escreve `snapshot.template = { id, version, config }`, mais `Certificate.templateId` (campo legado existente) = id; `UpsertCertificateRuleDto.templateId?: string` (validado: tem de ser um dos 9 de sistema → senão 400/404) é gravado em `CertificateRule.templateId`; `reissue()` copia `snapshot.template` do original; `getPdfFor()` carrega os assets referenciados em `snapshot.template.config.assets` e passa-os ao renderizador. Variáveis da emissão: `nome_completo`, `nome_curso`/`nome_formacao` (título), `nome_empresa` ("INNOVA" ou o `issuerName`), `carga_horaria` (`"<h> h"` só se existir), `nota_final` (`"<n>%"` só se existir), `data_emissao`/`data_validade` (pt-PT), `codigo_certificado`, `nome_instrutor`/`nome_trilha`/`competencias_adquiridas` apenas quando houver dados (por agora: vazios), `nome_empresa`.

- [ ] **Step 1: Tests** — emissão com regra sem template grava `snapshot.template.id === 'tpl-1-corporativo-classico'` e `version`; com `rule.templateId='tpl-3-…'` grava esse; **imutabilidade:** emitir com v1, `saveVersion` v2 (outro texto) e `getPdfFor` do certificado antigo continua a usar o plano da v1 (comparar `buildLayoutPlan(snapshot.template.config)` antes/depois) enquanto um certificado novo usa a v2; `reissue` mantém o `template` do original; regra com `templateId` desconhecido ou legado → 400; certificado antigo sem `snapshot.template` → clássico.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (+ specs existentes dos serviços tocados).
- [ ] **Step 5: Commit** `feat(certificates): emissão com template versionado no snapshot`.

### Task 8: Rotas HTTP e integração

**Files:** Modify `src/certificates/certificates.controller.ts`, `certificates.module.ts`, `certificates-admin.service.ts` (a lista `templates()` passa a delegar em `CertificateTemplatesService.list`); Test `test/integration/certificates/certificates-templates.integration-spec.ts`.

**Interfaces:** (declaradas antes de `:id/...`)
- `GET /certificates/templates` (ADMIN/RH/AUDITOR) → os 9; `GET /certificates/templates/:id` (idem) → detalhe + versões; `PUT /certificates/templates/:id` (ADMIN/RH) body = `TemplateConfig` → nova versão; `POST /certificates/templates/preview` (ADMIN/RH/AUDITOR) body = `TemplateConfig` → `application/pdf` (nada gravado); `POST /certificates/assets` (ADMIN/RH) body `{ kind, file }` → metadados; `GET /certificates/assets/:id` (ADMIN/RH/AUDITOR) → bytes com `Content-Type` do asset e `Cache-Control: private`, `X-Content-Type-Options: nosniff`.

- [ ] **Step 1: Integration tests (Postgres real)** — `GET /templates` devolve exactamente 9, duas vezes seguidas e depois de uma criação concorrente (3 pedidos em paralelo) continuam 9; colaborador/gestor → 403 em tudo; auditor lê e pré-visualiza (200 `%PDF-`) mas `PUT`/upload → 403; `PUT` com `{{inventada}}` → 400; com contraste mau → 400; com `layoutKey` diferente → 400; `PUT` válido → versão 2; **dois `PUT` simultâneos → versões 2 e 3 distintas**; upload de PNG válido → 201 e `GET /assets/:id` devolve os mesmos bytes; upload de `.exe` com MIME png, SVG e 3 MB → 400; emitir um certificado, guardar v2 do template e descarregar o PDF do certificado antigo → 200 `%PDF-` e o `snapshot` na BD mantém `version: 1`; preview com todas as 9 configs de origem → 200 `%PDF-`.
- [ ] **Step 2: Run** (por grupo, segundo plano) → FAIL. **Step 3: Implement.** **Step 4: Run** `certificates-templates` e depois, em grupos separados, `certificates`, `courses`, `enrollments`, `events` → PASS.
- [ ] **Step 5: Commit** `feat(certificates): endpoints de templates, versões e imagens`.

### Task 9: Frontend — galeria, editor e pré-visualização

**Files:** Create `frontend/components/certificates/{TemplateGallery,TemplateEditorModal,TemplatePreviewModal,ImageUploadField,VariableChips}.tsx`, `templateLabels.ts`; Modify `TemplatesTab.tsx`, `types.ts`; Test `TemplateGallery.test.tsx`, `TemplateEditorModal.test.tsx`, `ImageUploadField.test.tsx`.

**Interfaces:** `TemplatesTab({ canEdit })` mostra a galeria dos 9 (cartão com nome, descrição em português, amostra das 4 cores e versão actual) com **Pré-visualizar** (todos) e **Editar** (só `canEdit`). `TemplatePreviewModal({ config })`: chama `POST /certificates/templates/preview` e mostra o PDF num `<iframe>` por blob URL (revogação diferida), com estados de carga/erro. `TemplateEditorModal`: separadores **Textos · Cores · Imagens · Posição · Versões**; textos com `VariableChips` (botões que inserem `{{variavel}}` no campo activo, só da lista fechada, com explicação "campos opcionais desaparecem se não houver valor"); cores `<input type="color">` + hex; `ImageUploadField` (logótipo, fundo, assinatura) valida **tipo (PNG/JPEG), tamanho (≤ 2 MB) e não ser SVG** antes de enviar, mostra miniatura do que está guardado (via `GET /certificates/assets/:id` com credenciais) e permite remover; assinatura com a nota "imagem da assinatura — não é uma assinatura digital criptográfica"; posição: para cada elemento (logótipo, título, texto, nome, curso, detalhes, assinatura, QR, código) alinhamento (esquerda/centro/direita), tamanho (0.6–1.5) e deslocamento X/Y (−15%…+15%) + mostrar/ocultar; opções de mostrar QR, código, horas, validade, nota. Botões **Pré-visualizar** (com a configuração ainda não guardada) e **Guardar nova versão** (envia `PUT`; erros do servidor 400 mostrados em `AlertCard` com a lista). **Versões**: lista número, data e autor (só consulta; restaurar fica fora).

- [ ] **Step 1: Tests (vitest)** — a galeria mostra exactamente 9 cartões com os nomes certos e nenhum enum cru; `Editar` não aparece sem `canEdit`; `VariableChips` insere `{{nome_completo}}` na posição do cursor; `ImageUploadField` rejeita um `image/svg+xml`, um `image/gif` e um PNG de 3 MB **sem chamar a API**, aceita um PNG pequeno e envia `{kind, file}`; o editor bloqueia "Guardar" com título vazio ou hex inválido e mostra o erro 400 do servidor; "Pré-visualizar" envia a configuração actual do formulário; sucesso do `PUT` fecha o editor e invalida a lista.
- [ ] **Step 2: Run** `npx vitest run components/certificates` → FAIL. **Step 3: Implement.** **Step 4: Run** + `tsc --noEmit` + eslint → PASS.
- [ ] **Step 5: Commit** (repo frontend) `feat(certificates): galeria de nove templates, editor e pré-visualização`.

### Task 10: Frontend — escolher o template na regra de emissão

**Files:** Modify `frontend/components/certificates/RulesTab.tsx`, `types.ts`; Test `RulesTab.test.tsx`.

**Interfaces:** O formulário da regra ganha **Modelo de certificado** (selector com os 9 nomes; por omissão "Corporativo clássico") enviado como `templateId`; a lista de regras mostra o nome do modelo; erro 400 do servidor (modelo inválido) aparece no modal.

- [ ] **Step 1: Tests** — o formulário envia `templateId` escolhido no `PUT /certificates/rules`; a lista mostra o nome em português e nunca o id cru; sem escolha envia o clássico.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** (repo frontend) `feat(certificates): escolha do modelo na regra de emissão`.

### Task 11: Verificação final

- [ ] `tsc --noEmit` e eslint (BE não-spec, FE novos); prettier só nos ficheiros alterados do backend.
- [ ] Suite unitária completa BE, `vitest run` FE (módulos tocados) e integração por grupos separados (`certificates`, `courses`, `enrollments`, `events`).
- [ ] Gerar os **9 PDFs de pré-visualização** num ficheiro temporário e abri-los para confirmar visualmente que são distintos, legíveis e sem texto fora da página; guardar uma captura/nota no resumo.
- [ ] Verificação no browser (backend reiniciado, migração aplicada à BD de desenvolvimento **com autorização expressa do utilizador**): abrir Modelos, pré-visualizar, editar (cor + texto + logótipo), guardar v2, emitir um certificado novo e confirmar que o antigo não mudou.
- [ ] Resumo ao utilizador: o que ficou funcional, decisões e pendências (restaurar versões; imagens por URL; assinatura criptográfica).
