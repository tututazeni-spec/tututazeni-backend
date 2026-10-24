import { BadRequestException } from '@nestjs/common';
import {
  assertValidLessonFile,
  canManageLessonContent,
  decodePdfDataUrl,
  redactCourseFiles,
  redactModuleFiles,
  withoutInlinePdf,
} from './lesson-files';
import { dataUrl, pdf } from '../files/file-fixtures';

const pdfUrl = `data:application/pdf;base64,${Buffer.from('%PDF-1.7 corpo').toString('base64')}`;
const realPdfUrl = dataUrl('application/pdf', pdf());
const user = (name: string) => ({ id: 1, role: { name } });

describe('lesson-files', () => {
  describe('canManageLessonContent', () => {
    it.each(['ADMIN', 'RH', 'INSTRUCTOR'])('%s gere conteúdos', name => {
      expect(canManageLessonContent(user(name))).toBe(true);
    });
    it.each(['COLABORADOR', 'GESTOR', 'LIDER'])('%s não gere conteúdos', name => {
      expect(canManageLessonContent(user(name))).toBe(false);
    });
  });

  describe('assertValidLessonFile', () => {
    it('aceita PDF verdadeiro em lições PDF e TEXT', () => {
      expect(() => assertValidLessonFile('PDF', realPdfUrl)).not.toThrow();
      expect(() => assertValidLessonFile('TEXT', realPdfUrl)).not.toThrow();
    });
    it('aceita URLs http(s) e ausência de ficheiro', () => {
      expect(() => assertValidLessonFile('PDF', 'https://x.test/a.pdf')).not.toThrow();
      expect(() => assertValidLessonFile('PDF', undefined)).not.toThrow();
    });
    it('ignora outros tipos de lição', () => {
      expect(() => assertValidLessonFile('VIDEO', 'data:video/mp4;base64,AAAA')).not.toThrow();
    });
    it('rejeita mime que não é PDF', () => {
      expect(() => assertValidLessonFile('PDF', 'data:text/html;base64,PGI+')).toThrow(
        BadRequestException,
      );
    });
    it('rejeita conteúdo sem assinatura %PDF- mesmo com mime de PDF', () => {
      const fake = `data:application/pdf;base64,${Buffer.from('<script>x</script>').toString('base64')}`;
      expect(() => assertValidLessonFile('PDF', fake)).toThrow(/só são aceites PDFs/);
    });
    it('rejeita PDFs com JavaScript ou truncados, mesmo com assinatura %PDF-', () => {
      expect(() =>
        assertValidLessonFile('PDF', dataUrl('application/pdf', pdf('/JS (x)'))),
      ).toThrow(/só são aceites PDFs/);
      expect(() => assertValidLessonFile('PDF', pdfUrl)).toThrow(/só são aceites PDFs/);
    });
    it('rejeita ficheiros acima do limite', () => {
      const big = `data:application/pdf;base64,${'A'.repeat(7_000_001)}`;
      expect(() => assertValidLessonFile('PDF', big)).toThrow(/5 MB/);
    });
  });

  describe('redacção do PDF inline', () => {
    it('decodifica o PDF inline', () => {
      expect(decodePdfDataUrl(pdfUrl)?.toString('latin1')).toBe('%PDF-1.7 corpo');
      expect(decodePdfDataUrl('https://x.test/a.pdf')).toBeNull();
    });
    it('remove o PDF inline mas marca hasFile', () => {
      expect(withoutInlinePdf({ id: 1, contentUrl: pdfUrl })).toEqual({
        id: 1,
        contentUrl: null,
        hasFile: true,
      });
    });
    it('mantém URLs externas e marca hasFile=false sem ficheiro', () => {
      expect(withoutInlinePdf({ contentUrl: 'https://x.test/a.pdf' })).toEqual({
        contentUrl: 'https://x.test/a.pdf',
        hasFile: true,
      });
      expect(withoutInlinePdf({ contentUrl: null }).hasFile).toBe(false);
    });
    it('aplica-se a módulos e cursos', () => {
      const mod = { lessons: [{ contentUrl: pdfUrl }] };
      expect(redactModuleFiles(mod).lessons[0].contentUrl).toBeNull();
      expect(redactCourseFiles({ modules: [mod] }).modules[0].lessons[0].contentUrl).toBeNull();
    });
  });
});
