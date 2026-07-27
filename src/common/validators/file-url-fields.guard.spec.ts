// ─── Guard-rail: campos fileUrl/logoUrl/signatureUrl sem @IsAllowedFileUrl() ───
//
// Contexto: a auditoria A-5 (2026-07-14) estabeleceu que qualquer campo que
// referencia um ficheiro já carregado para storage externo deve ser validado
// com @IsAllowedFileUrl() (HTTPS + allowlist de domínio via ALLOWED_FILE_HOST).
// Um follow-up (A-9) encontrou 3 desvios a essa convenção que passaram
// despercebidos em módulos criados antes ou depois da auditoria original
// (crm-funders, work-declaration, certification) — nenhum deles foi apanhado
// automaticamente porque a disciplina dependia só de revisão manual.
//
// Este teste varre `src/` e falha se encontrar:
//   A) um controller a extrair fileUrl/logoUrl/signatureUrl/url directamente
//      de @Body('...') em vez de passar por um DTO — o padrão exacto do bug
//      em crm-funders (fileUrl sem qualquer validação);
//   B) uma propriedade de DTO chamada fileUrl/logoUrl/signatureUrl/url sem
//      @IsAllowedFileUrl() nos decoradores imediatamente anteriores — o
//      padrão exacto do bug em work-declaration/certification/course-modules
//      (@IsUrl() ou @IsString() em vez do validador com allowlist).
//
// Âmbito deliberadamente restrito a estes nomes de campo exactos — são os
// únicos já estabelecidos nesta base de código como "referência a ficheiro em
// storage externo". Campos como webhookUrl/baseUrl/cdnBaseUrl (sufixo, não
// nome exacto) são URLs externas por natureza (integrações) e não devem ser
// forçados à mesma allowlist; ficam fora deste guard-rail (o match é
// case-sensitive e sem variação de sufixo, por isso não os apanha).
//
// Excepção documentada: um campo `url` genuinamente dual-propósito (ficheiro
// OU link externo, ex: AddEvidenceDto em development-plans) pode marcar a
// linha com o comentário `// file-url-exempt: <motivo>` para ser ignorado
// por este guard-rail — a excepção fica visível e revista no próprio código.

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.join(__dirname, '..', '..');
const GUARDED_FIELDS = ['fileUrl', 'logoUrl', 'signatureUrl', 'url'];
const EXEMPT_MARKER = 'file-url-exempt:';
const VALIDATOR_FILE = path.join(__dirname, 'is-allowed-file-url.validator.ts');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      full !== __filename
    ) {
      out.push(full);
    }
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  reason: string;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  const bodyExtractionRe = new RegExp(`@Body\\(\\s*['"](${GUARDED_FIELDS.join('|')})['"]\\s*\\)`);
  // [?!]? cobre tanto propriedades opcionais (nome?: string) como obrigatórias
  // com definite-assignment assertion (nome!: string) — só \?? deixava passar
  // despercebido qualquer campo obrigatório (ex: url!: string em
  // CreateModuleMaterialDto, encontrado só numa revisão manual posterior).
  const propertyRe = new RegExp(`^\\s*(${GUARDED_FIELDS.join('|')})[?!]?\\s*:\\s*string`);

  for (const file of listSourceFiles(SRC_ROOT)) {
    if (path.resolve(file) === path.resolve(VALIDATOR_FILE)) continue; // define o validador, não o consome
    const relFile = path.relative(SRC_ROOT, file).split(path.sep).join('/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, idx) => {
      // Check A — extracção crua via @Body('fileUrl') fora de um DTO
      const bodyMatch = line.match(bodyExtractionRe);
      if (bodyMatch) {
        violations.push({
          file: relFile,
          line: idx + 1,
          reason:
            `@Body('${bodyMatch[1]}') extrai o campo directamente sem passar por um DTO ` +
            `com @IsAllowedFileUrl() — crie/una um DTO (ver src/crm-funders/dto/submit-report.dto.ts).`,
        });
      }

      // Check B — propriedade de DTO sem @IsAllowedFileUrl() nas linhas anteriores
      const propMatch = line.match(propertyRe);
      const isDtoFile = relFile.includes('/dto/') || relFile.endsWith('.dto.ts');
      if (propMatch && isDtoFile && !line.includes(EXEMPT_MARKER)) {
        const windowStart = Math.max(0, idx - 6);
        const window = lines.slice(windowStart, idx + 1).join('\n');
        if (!window.includes('@IsAllowedFileUrl(')) {
          violations.push({
            file: relFile,
            line: idx + 1,
            reason:
              `Campo '${propMatch[1]}' sem @IsAllowedFileUrl() nos decoradores imediatamente ` +
              `anteriores (import de '.../common/validators/is-allowed-file-url.validator').`,
          });
        }
      }
    });
  }

  return violations;
}

describe(`Guard-rail: ${GUARDED_FIELDS.join('/')} devem usar @IsAllowedFileUrl()`, () => {
  it('não encontra campos de ficheiro sem o validador de allowlist', () => {
    const violations = scan();
    if (violations.length > 0) {
      const report = violations.map(v => `  ${v.file}:${v.line} — ${v.reason}`).join('\n');
      throw new Error(
        `Encontrado(s) ${violations.length} campo(s) ${GUARDED_FIELDS.join('/')} ` +
          `sem @IsAllowedFileUrl() (ver docs/security/2026-07-14-auditoria-a5-upload-ficheiros.md):\n${report}`,
      );
    }
    expect(violations).toHaveLength(0);
  });
});
