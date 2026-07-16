# Auditoria A-5 — Upload de Ficheiros e Validação de URLs (INNOVA)

> Faixa A-5 da auditoria de production readiness. Data: 2026-07-14.
> Âmbito: endpoints de upload multipart, armazenamento de ficheiros, validação
> de URLs de ficheiros externos, e superfície de ataque do Multer.
> Repositório: `innova` (backend NestJS).
> **Todos os achados foram remediados em PR#30 (A5-PR1) e PR#31 (A5-PR2).**

---

## 1. Resumo executivo

A faixa A-5 revelou uma situação atípica: o backend tinha dois endpoints de
upload multipart (`POST /work-declaration/branding/logo` e
`POST /work-declaration/:id/sign`) que **recebiam ficheiros mas não os
armazenavam** — o logo persistia apenas o `originalname` (valor controlado
pelo cliente, sem qualquer validação), e o ficheiro de assinatura era
simplesmente descartado após processamento.

Paralelamente, 8 outros módulos aceitavam `{ fileUrl: string }` para
referenciar ficheiros já armazenados externamente, mas sem qualquer validação
do URL — qualquer string passava (`@IsString()`), incluindo URLs de domínios
arbitrários ou esquemas maliciosos.

A remediação seguiu a arquitectura real do sistema: remover o Multer (que
estava a receber ficheiros sem destino) e unificar em `{ fileUrl: string }` com
um validador dedicado `@IsAllowedFileUrl()` que verifica HTTPS e allowlist de
domínios.

---

## 2. Achados

| ID | Severidade | Descrição | Evidência | Estado |
|---|---|---|---|---|
| A5-1 | 🔴 Crítico | `originalname` (valor clientside, sem validação) persistido como `logoUrl` na BD — path traversal, social engineering, injecção de strings arbitrárias | `src/work-declaration/work-declaration.service.ts` (logo upload) | ✅ PR#30 |
| A5-2 | 🟠 Alto | `signatureFile` recebido pelo Multer e completamente descartado — endpoint `multipart` sem funcionalidade e com superfície de ataque desnecessária | `src/work-declaration/work-declaration.controller.ts` (sign) | ✅ PR#30 |
| A5-3 | 🟠 Alto | MIME type validado apenas clientside (frontend), sem verificação no backend — qualquer ficheiro passava | Ausência de validação em `work-declaration` | ✅ PR#30 |
| A5-4 | 🟠 Alto | `fileUrl` sem validação em 8 módulos — `@IsString()` aceita `javascript:alert(1)`, `http://evil.com/malware.exe`, ou URLs de domínios não autorizados | 8 DTOs em `onboarding`, `library`, `document-repository`, `employees`, `assessments`, `avatar-training` | ✅ PR#31 |
| A5-5 | 🟡 Médio | Limite de 10 MB configurado no `MulterModule` mas sem validação de tipo de ficheiro — um atacante podia enviar 10 MB de conteúdo arbitrário | `src/work-declaration/work-declaration.module.ts` | ✅ PR#30 (Multer removido) |

---

## 3. Cenários de ataque

### 3.1 Persistência de `originalname` como `logoUrl`

**Path traversal no nome do ficheiro.** Um utilizador autenticado com acesso
ao endpoint de branding enviava `multipart/form-data` com um ficheiro cujo
`originalname` era `../../../../etc/passwd`. O controller passava esse valor
directamente ao service:

```typescript
// Antes (vulnerável)
this.service.updateBranding({ logoUrl: logo?.originalname });
// → BD ficava com logoUrl = "../../../../etc/passwd"
```

Embora o backend não acedesse ao ficheiro localmente (não havia armazenamento),
o valor era persistido na BD e potencialmente exposto no frontend como URL —
criando um vector de path traversal quando o frontend tentasse construir um link
ou quando outro sistema consumisse o campo.

**Injecção de conteúdo arbitrário.** `originalname` é totalmente controlado
pelo cliente: não é o nome real do ficheiro no disco, mas o nome declarado
pelo browser. Qualquer string era aceite, incluindo scripts, URLs de phishing,
ou identificadores de sistemas internos.

### 3.2 `fileUrl` sem validação de domínio

**Redirection para conteúdo malicioso.** Um utilizador autenticado enviava
`{ "fileUrl": "https://evil.com/malware.exe" }` num endpoint como
`POST /documents` ou `POST /onboarding/upload`. O backend aceitava o URL
(`@IsString()` válido), persistia-o na BD, e qualquer utilizador que depois
acedesse ao documento recebia um link para conteúdo arbitrário externo.

**Exfiltração via SSRF.** URLs como `http://169.254.169.254/latest/meta-data/`
(AWS IMDS) ou `http://localhost:9090` (Prometheus interno) podiam ser
submetidos e, se o frontend ou outro serviço fizesse fetch do URL armazenado,
resultavam em SSRF.

**Esquemas maliciosos.** `javascript:alert(document.cookie)`,
`data:text/html,<script>...`, ou `file:///etc/passwd` passavam a validação
`@IsString()`.

---

## 4. Correcções aplicadas

### 4.1 A5-PR1 — Remover Multer, converter para URL-string

**`src/work-declaration/work-declaration.module.ts`** — `MulterModule` removido:

```typescript
// Antes
imports: [
  MulterModule.register({ storage: memoryStorage() }),
  ...
]

// Depois
imports: [ /* sem MulterModule */ ]
```

**`src/work-declaration/work-declaration.controller.ts`** — dois endpoints convertidos:

```typescript
// Antes — multipart/form-data com ficheiro fantasma
@Post('branding/logo')
@UseInterceptors(FileInterceptor('logo'))
@ApiConsumes('multipart/form-data')
async uploadLogo(@UploadedFile() logo: Express.Multer.File) {
  return this.service.updateBranding({ logoUrl: logo?.originalname });
}

// Depois — application/json com URL validado
@Post('branding/logo')
async uploadLogo(@Body() dto: UploadLogoDto) {
  return this.service.updateBranding({ logoUrl: dto.fileUrl });
}
```

O endpoint `POST /:id/sign` foi simplificado da mesma forma: o `signatureFile`
fantasma foi removido e o `SignDeclarationDto` existente (com `signatureUrl:
string`) passou a ser o único input.

### 4.2 A5-PR2 — Validador `@IsAllowedFileUrl()` universal

**`src/common/validators/is-allowed-file-url.validator.ts`** — criado em PR#30,
aplicado a todos os módulos em PR#31:

```typescript
// Lógica de validação (por ordem)
// 1. Verificar que é string não vazia
// 2. Parsear como new URL(value) — rejeitar se inválido
// 3. Rejeitar se url.protocol !== 'https:'
// 4. Ler ALLOWED_FILE_HOST (lista separada por vírgulas)
// 5. Rejeitar se url.hostname não estiver na allowlist

registerDecorator({
  name: 'isAllowedFileUrl',
  // ...
  validator: {
    validate(value: unknown, args: ValidationArguments): boolean {
      if (typeof value !== 'string' || !value) return false;
      let url: URL;
      try { url = new URL(value); } catch { return false; }
      if (url.protocol !== 'https:') return false;
      const allowed = (process.env.ALLOWED_FILE_HOST ?? '').split(',').map(h => h.trim()).filter(Boolean);
      if (!allowed.length) return true; // permissivo sem configuração (testes/dev)
      return allowed.includes(url.hostname);
    }
  }
});
```

**Comportamento:**
- `https://storage.innova.ao/logo.png` → ✅ válido
- `http://storage.innova.ao/logo.png` → ❌ esquema não HTTPS
- `javascript:alert(1)` → ❌ esquema inválido
- `https://evil.com/logo.png` → ❌ domínio não autorizado
- `not-a-url` → ❌ URL inválida

**DTOs actualizados** em PR#31 (substituição de `@IsString()` por `@IsAllowedFileUrl()`):

| Módulo | DTO | Campo |
|---|---|---|
| `work-declaration` | `UploadLogoDto` | `fileUrl` (criado em PR#30) |
| `onboarding` | `UploadDocumentDto` | `fileUrl` |
| `library` | `CreateLibraryItemDto` | `fileUrl` |
| `document-repository` | `CreateDocumentDto`, `NewVersionDto` | `fileUrl` |
| `employees` | `EmployeesCreateDocumentDto` | `fileUrl` |
| `assessments` | `AssessmentsAnswerDto` | `fileUrl` |
| `avatar-training` | `UploadKnowledgeDto` | `fileUrl` |

---

## 5. Resultado final

| Sub-faixa | Achados | PRs | Estado |
|---|---|---|---|
| A5-PR1 Multer + logo/sign | 3 (A5-1, A5-2, A5-5) | #30 | ✅ |
| A5-PR2 fileUrl validator | 2 (A5-3, A5-4) | #31 | ✅ |
| **Total** | **5** | **2 PRs** | **✅ Encerrado** |

A faixa A-5 está encerrada. Não existem endpoints `multipart/form-data` no
backend. Todos os campos `fileUrl` são validados com `@IsAllowedFileUrl()`,
que verifica HTTPS e allowlist de domínios configurável via `ALLOWED_FILE_HOST`.
