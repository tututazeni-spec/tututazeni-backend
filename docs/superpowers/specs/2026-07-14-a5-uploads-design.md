# A5 — Uploads de Ficheiros: Design Spec

**Data:** 2026-07-14
**Faixa:** A-5 (Auditoria de Segurança)
**PRs:** A5-PR1 (multer removal) + A5-PR2 (fileUrl validator)

---

## Contexto

A auditoria A-5 identificou que os dois únicos endpoints de upload binário real (`POST /work-declaration/branding/logo` e `POST /work-declaration/:id/sign`) recebem ficheiros multipart mas não os armazenam — o logo guarda apenas `logo?.originalname` (valor controlado pelo cliente) na BD, e o `signatureFile` é completamente descartado. Não existe serviço de armazenamento de ficheiros planeado.

Todos os outros módulos com "upload" já usam o padrão URL-string: o cliente envia `{ fileUrl: string }` referenciando um ficheiro já armazenado externamente.

---

## Achados resolvidos

| ID | Severidade | Resolução |
|----|-----------|-----------|
| A5-1 | 🔴 Crítico | `originalname` → substituído por `dto.fileUrl` validado |
| A5-2 | 🟠 Alto | `signatureFile` fantasma → interceptor removido |
| A5-3 | 🟠 Alto | MIME check clientside → ficheiro deixa de passar pelo backend |
| A5-4 | 🟠 Alto | `fileUrl` sem validação → `@IsAllowedFileUrl()` em todos os DTOs |
| A5-5 | 🟡 Médio | Limite 10MB → `MulterModule` removido, problema desaparece |

---

## A5-PR1 — Remover Multer, criar validator e converter `work-declaration` para URL-string

> O validator `@IsAllowedFileUrl()` é criado neste PR porque é necessário para `UploadLogoDto`. O PR2 apenas aplica-o aos outros módulos.

### Ficheiros alterados

**`src/common/validators/is-allowed-file-url.validator.ts`** ← **criado aqui** (ver spec completa em A5-PR2)

**`src/work-declaration/work-declaration.module.ts`**
- Remover `MulterModule.register(...)` e import `memoryStorage` de multer
- Remover `MulterModule` dos imports do `@Module`

**`src/work-declaration/work-declaration.dto.ts`**
- Adicionar `UploadLogoDto`:
  ```ts
  export class UploadLogoDto {
    @ApiProperty({ description: 'URL do logo já carregado para storage externo' })
    @IsAllowedFileUrl()
    fileUrl!: string;
  }
  ```

**`src/work-declaration/work-declaration.controller.ts`**

`POST /branding/logo`:
- Remover `@UseInterceptors(FileInterceptor('logo'))`, `@ApiConsumes('multipart/form-data')`, `@UploadedFile() logo`
- Adicionar `@Body() dto: UploadLogoDto`
- Service call: `{ logoUrl: dto.fileUrl }` em vez de `{ logoUrl: logo?.originalname }`

`POST /:id/sign`:
- Remover `@UseInterceptors(FileInterceptor('signatureFile'))`, `@ApiConsumes('multipart/form-data')`, `@UploadedFile() signatureFile`
- O `SignDeclarationDto` já tem `signatureUrl: string` — nenhuma alteração ao DTO nem ao serviço

### Impacto no frontend
Os dois endpoints passam a `Content-Type: application/json`. O frontend deve enviar `{ "fileUrl": "https://..." }` em vez de `multipart/form-data`.

---

## A5-PR2 — Validador `@IsAllowedFileUrl()` e aplicação a todos os DTOs

### Ficheiro novo: `src/common/validators/is-allowed-file-url.validator.ts`

**Lógica de validação (por ordem):**
1. Verificar que é string não vazia
2. Parsear como `new URL(value)` — lançar se inválido
3. Rejeitar se `url.protocol !== 'https:'`
4. Ler `process.env.ALLOWED_FILE_HOST` (string separada por vírgulas, ex: `storage.innova.ao,cdn.innova.ao`)
5. Rejeitar se `url.hostname` não estiver na lista de hosts permitidos
6. Registado via `registerDecorator` do class-validator como `@IsAllowedFileUrl()`

**Mensagens de erro:**
- URL inválida: `"fileUrl deve ser uma URL válida"`
- Esquema errado: `"fileUrl deve usar HTTPS"`
- Host não permitido: `"fileUrl aponta para um domínio não autorizado"`

### `.env.example`
Adicionar linha:
```
ALLOWED_FILE_HOST=storage.innova.ao
```

### DTOs actualizados

| Ficheiro | Classe | Campo | Nota |
|----------|--------|-------|------|
| `src/common/validators/is-allowed-file-url.validator.ts` | — | — | criado em **PR1**, aplicado aqui aos restantes |
| `src/work-declaration/work-declaration.dto.ts` | `UploadLogoDto` | `fileUrl` | criado em PR1 |
| `src/onboarding/onboarding.dto.ts` | `UploadDocumentDto` | `fileUrl` | substituir `@IsString()` |
| `src/library/dto/create-item.dto.ts` | `CreateLibraryItemDto` | `fileUrl` | substituir `@IsString()` |
| `src/document-repository/document-repository.dto.ts` | `CreateDocumentDto` | `fileUrl` | substituir `@IsString()` |
| `src/document-repository/document-repository.dto.ts` | `NewVersionDto` | `fileUrl` | substituir `@IsString()` |
| `src/employees/employees.dto.ts` | `EmployeesCreateDocumentDto` | `fileUrl` | substituir `@IsString()` |
| `src/assessments/assessments.dto.ts` | `AssessmentsAnswerDto` | `fileUrl` | manter `@IsOptional()`, substituir `@IsString()` |
| `src/avatar-training/avatar-training.dto.ts` | `UploadKnowledgeDto` | `fileUrl` | substituir `@IsString()` |

---

## Testes

### A5-PR1
- Unit test ao controller de `work-declaration`: confirmar que `POST /branding/logo` com body `{ fileUrl }` válido chama o service com `logoUrl: dto.fileUrl`
- Confirmar que `POST /:id/sign` sem `signatureFile` funciona (apenas dto)

### A5-PR2
- Unit tests ao `IsAllowedFileUrl` validator:
  - `https://storage.innova.ao/logo.png` → válido (host permitido)
  - `http://storage.innova.ao/logo.png` → inválido (http)
  - `javascript:alert(1)` → inválido
  - `https://evil.com/logo.png` → inválido (host não autorizado)
  - `https://storage.innova.ao/../../../etc/passwd` → válido (path traversal não é risco aqui — URL é apenas referência, não acesso a ficheiro local)
  - `""` → inválido
  - `not-a-url` → inválido

---

## Sem alterações ao schema Prisma
Nenhum modelo é alterado — `logoUrl`, `signatureUrl`, `fileUrl` já existem como `String` nos modelos relevantes.

---

## Ordem de implementação
1. **A5-PR1** primeiro — remove o risco crítico (🔴 A5-1) e limpa o Multer
2. **A5-PR2** a seguir — validador partilhado aplicado a toda a base de código
