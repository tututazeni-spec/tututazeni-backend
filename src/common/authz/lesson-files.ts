// src/common/authz/lesson-files.ts
// PDFs de lições ficam guardados inline em Lesson.contentUrl (data URL base64).
// Este módulo concentra (1) quem gere conteúdos, (2) a validação do ficheiro ao
// gravar e (3) a remoção do ficheiro das respostas para quem não deve recebê-lo
// por inteiro — o aluno obtém-no por GET /lessons/:id/file, que valida o acesso.
import { BadRequestException } from '@nestjs/common';
import { Role } from '../../auth/enums/role.enum';
import { formatLimit, maxDecodedBytes } from '../files/data-url';
import { FILE_POLICIES } from '../files/file-policies';
import { isPrivileged } from './ownership';

/** Papéis que criam/editam lições e por isso podem sempre ver os ficheiros. */
export const CONTENT_MANAGER_ROLES: Role[] = [Role.ADMIN, Role.RH, Role.INSTRUCTOR];

const PDF_DATA_URL = /^data:application\/pdf;base64,/i;

interface UserLike {
  id: number;
  role?: { name: string } | null;
}

export function canManageLessonContent(user: UserLike): boolean {
  return isPrivileged(user, CONTENT_MANAGER_ROLES);
}

export function isInlinePdf(contentUrl: string | null | undefined): contentUrl is string {
  return !!contentUrl && PDF_DATA_URL.test(contentUrl);
}

/** Decodifica um data URL de PDF; `null` se não for um PDF inline. */
export function decodePdfDataUrl(contentUrl: string | null | undefined): Buffer | null {
  if (!isInlinePdf(contentUrl)) return null;
  return Buffer.from(contentUrl.slice(contentUrl.indexOf(',') + 1), 'base64');
}

/**
 * Rejeita ficheiros inline em lições PDF/TEXT que não sejam PDFs verdadeiros
 * (tipo declarado, assinatura `%PDF-` e tamanho). URLs http(s) passam.
 */
export function assertValidLessonFile(
  type: string | undefined,
  contentUrl: string | null | undefined,
) {
  if (!contentUrl || (type !== 'PDF' && type !== 'TEXT')) return;
  if (!contentUrl.startsWith('data:')) return;
  const payloadChars = contentUrl.length - (contentUrl.indexOf(',') + 1);
  if (maxDecodedBytes(payloadChars) - 2 > FILE_POLICIES.PDF.maxBytes) {
    throw new BadRequestException(
      `O PDF excede o tamanho máximo de ${formatLimit(FILE_POLICIES.PDF.maxBytes)}`,
    );
  }
  const bytes = decodePdfDataUrl(contentUrl);
  if (!bytes || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new BadRequestException('Ficheiro inválido: só são aceites PDFs');
  }
}

interface LessonWithFile {
  contentUrl?: string | null;
}

/** Copia a lição sem o PDF inline e marca `hasFile` (o ficheiro vai por /lessons/:id/file). */
export function withoutInlinePdf<T extends LessonWithFile>(lesson: T): T & { hasFile: boolean } {
  const hasFile = !!lesson.contentUrl;
  return isInlinePdf(lesson.contentUrl)
    ? { ...lesson, contentUrl: null, hasFile }
    : { ...lesson, hasFile };
}

/** Aplica `withoutInlinePdf` às lições de um módulo/curso para quem não gere conteúdos. */
export function redactModuleFiles<M extends { lessons?: LessonWithFile[] }>(mod: M): M {
  return mod.lessons ? { ...mod, lessons: mod.lessons.map(withoutInlinePdf) } : mod;
}

export function redactCourseFiles<C extends { modules?: { lessons?: LessonWithFile[] }[] }>(
  course: C,
): C {
  return course.modules ? { ...course, modules: course.modules.map(redactModuleFiles) } : course;
}
