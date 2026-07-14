import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UploadKnowledgeDto } from './avatar-training.dto';

describe('UploadKnowledgeDto', () => {
  it('fileUrl e title válidos passam', async () => {
    const errors = await validate(
      plainToInstance(UploadKnowledgeDto, {
        fileUrl: 'https://example.com/doc.pdf',
        title: 'Manual de Onboarding',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('fileUrl inválida (não é URL) falha', async () => {
    const errors = await validate(
      plainToInstance(UploadKnowledgeDto, { fileUrl: 'não-é-url', title: 'Manual' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('title em falta falha', async () => {
    const errors = await validate(
      plainToInstance(UploadKnowledgeDto, { fileUrl: 'https://example.com/doc.pdf' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('title acima de 200 chars falha', async () => {
    const errors = await validate(
      plainToInstance(UploadKnowledgeDto, {
        fileUrl: 'https://example.com/doc.pdf',
        title: 'a'.repeat(201),
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
