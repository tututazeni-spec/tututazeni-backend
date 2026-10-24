// Garante que os DTOs que recebem ficheiros inline rejeitam disfarces (conteúdo ≠ tipo declarado),
// em vez de confiarem só no prefixo do data URL.
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateContentDto } from '../../content-library/content-library.dto';
import { CreateCourseDto } from '../../courses/courses.dto';
import { LeaveDocumentInputDto } from '../../leave-management/leave-management.dto';
import { UploadDocumentDto } from '../../onboarding/onboarding.dto';
import { UpdateMyAvatarDto } from '../../users/users.dto';
import { dataUrl, docx, jpeg, pdf, png } from './file-fixtures';

type Ctor<T> = new () => T;

async function propErrors<T extends object>(Cls: Ctor<T>, prop: string, value: unknown) {
  const dto = plainToInstance(Cls, { [prop]: value });
  return (await validate(dto)).filter(e => e.property === prop);
}
const ok = async <T extends object>(Cls: Ctor<T>, prop: string, value: unknown) =>
  (await propErrors(Cls, prop, value)).length === 0;

const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('avatar (UpdateMyAvatarDto)', () => {
  it('aceita imagem verdadeira dentro de 150 KB', async () => {
    expect(await ok(UpdateMyAvatarDto, 'avatarUrl', dataUrl('image/png', png(200, 200)))).toBe(
      true,
    );
    expect(await ok(UpdateMyAvatarDto, 'avatarUrl', dataUrl('image/jpeg', jpeg()))).toBe(true);
  });
  it('rejeita EXE/HTML com prefixo de imagem', async () => {
    expect(await ok(UpdateMyAvatarDto, 'avatarUrl', dataUrl('image/png', EXE))).toBe(false);
    expect(await ok(UpdateMyAvatarDto, 'avatarUrl', dataUrl('image/jpeg', HTML))).toBe(false);
  });
  it('rejeita acima de 150 KB e acima de 2000 px', async () => {
    expect(
      await ok(UpdateMyAvatarDto, 'avatarUrl', dataUrl('image/png', png(10, 10, 160_000))),
    ).toBe(false);
    expect(await ok(UpdateMyAvatarDto, 'avatarUrl', dataUrl('image/png', png(2001, 10)))).toBe(
      false,
    );
  });
});

describe('comprovativos de licença (LeaveDocumentInputDto.fileUrl)', () => {
  it('aceita PDF e imagem verdadeiros e URL https', async () => {
    expect(await ok(LeaveDocumentInputDto, 'fileUrl', dataUrl('application/pdf', pdf()))).toBe(
      true,
    );
    expect(await ok(LeaveDocumentInputDto, 'fileUrl', dataUrl('image/png', png()))).toBe(true);
  });
  it('rejeita PDF falso, PDF com JavaScript e HTML', async () => {
    expect(await ok(LeaveDocumentInputDto, 'fileUrl', dataUrl('application/pdf', HTML))).toBe(
      false,
    );
    expect(
      await ok(LeaveDocumentInputDto, 'fileUrl', dataUrl('application/pdf', pdf('/JS (x)'))),
    ).toBe(false);
    expect(await ok(LeaveDocumentInputDto, 'fileUrl', dataUrl('image/png', pdf()))).toBe(false);
  });
});

describe('documento de onboarding (UploadDocumentDto.fileUrl, só PDF, 3 MB)', () => {
  it('aceita PDF verdadeiro e rejeita imagem e PDF falso', async () => {
    expect(await ok(UploadDocumentDto, 'fileUrl', dataUrl('application/pdf', pdf()))).toBe(true);
    expect(await ok(UploadDocumentDto, 'fileUrl', dataUrl('image/png', png()))).toBe(false);
    expect(await ok(UploadDocumentDto, 'fileUrl', dataUrl('application/pdf', EXE))).toBe(false);
  });
});

describe('biblioteca de conteúdos (CreateContentDto)', () => {
  it('url: aceita docx verdadeiro, rejeita macro, zip qualquer e URL javascript:', async () => {
    expect(await ok(CreateContentDto, 'url', dataUrl(DOCX_MIME, docx()))).toBe(true);
    const macro = docx([{ name: 'word/vbaProject.bin' }]);
    expect(await ok(CreateContentDto, 'url', dataUrl(DOCX_MIME, macro))).toBe(false);
    expect(await ok(CreateContentDto, 'url', dataUrl(DOCX_MIME, EXE))).toBe(false);
    expect(await ok(CreateContentDto, 'url', 'javascript:alert(1)')).toBe(false);
    expect(await ok(CreateContentDto, 'url', 'https://youtu.be/abc')).toBe(true);
  });
  it('thumbnailUrl: valida imagem inline, aceita vazio e URL https', async () => {
    expect(await ok(CreateContentDto, 'thumbnailUrl', dataUrl('image/png', png()))).toBe(true);
    expect(await ok(CreateContentDto, 'thumbnailUrl', dataUrl('image/png', HTML))).toBe(false);
    expect(await ok(CreateContentDto, 'thumbnailUrl', '')).toBe(true);
    expect(await ok(CreateContentDto, 'thumbnailUrl', 'https://cdn.innova.ao/a.png')).toBe(true);
    expect(await ok(CreateContentDto, 'thumbnailUrl', 'javascript:alert(1)')).toBe(false);
  });
});

describe('capa de curso (CreateCourseDto.thumbnailUrl)', () => {
  it('vazio = sem imagem; imagem verdadeira passa; disfarce não', async () => {
    expect(await ok(CreateCourseDto, 'thumbnailUrl', '')).toBe(true);
    expect(await ok(CreateCourseDto, 'thumbnailUrl', dataUrl('image/jpeg', jpeg(100, 56)))).toBe(
      true,
    );
    expect(await ok(CreateCourseDto, 'thumbnailUrl', dataUrl('image/jpeg', EXE))).toBe(false);
  });
});
