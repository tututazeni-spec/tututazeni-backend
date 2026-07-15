import { validate } from 'class-validator';
import { UploadKnowledgeDto } from './avatar-training.dto';

async function errorsFor(fileUrl: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new UploadKnowledgeDto(), { fileUrl, title: 'Manual' });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('UploadKnowledgeDto.fileUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/knowledge.pdf')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/k.pdf')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/k.pdf')).length).toBeGreaterThan(0);
  });
});
