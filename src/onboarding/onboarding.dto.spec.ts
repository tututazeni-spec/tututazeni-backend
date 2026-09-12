import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UploadDocumentDto, CreateOnboardingTemplateDto } from './onboarding.dto';

async function errorsFor(fileUrl: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new UploadDocumentDto(), {
    planId: 1,
    documentType: 'ID',
    fileUrl,
  });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('UploadDocumentDto.fileUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/doc.pdf')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/doc.pdf')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/doc.pdf')).length).toBeGreaterThan(0);
  });
});

describe('CreateOnboardingTemplateDto — Estrutura aninhada (tasks)', () => {
  const baseTemplate = {
    name: 'Onboarding Comercial',
    durationDays: 30,
    company: 'INNOVA',
    location: 'Lisboa',
  };

  it('aceita sem tasks (estrutura adicionada depois, como hoje)', async () => {
    const dto = plainToInstance(CreateOnboardingTemplateDto, baseTemplate);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita tasks cobrindo a Estrutura pedida, cada uma com Responsável e Prazo', async () => {
    const dto = plainToInstance(CreateOnboardingTemplateDto, {
      ...baseTemplate,
      tasks: [
        {
          title: 'Assinar contrato',
          category: 'ADMIN',
          type: 'TASK',
          phase: 'PRE_BOARDING',
          responsible: 'HR',
          dueDayOffset: 0,
          xpReward: 10,
          seq: 0,
        },
        {
          title: 'Formação de compliance',
          category: 'TRAINING',
          type: 'COURSE',
          phase: 'WEEK_1',
          responsible: 'SELF',
          dueDayOffset: 7,
          xpReward: 20,
          seq: 1,
        },
        {
          title: 'Ler política de segurança',
          category: 'POLICIES',
          type: 'DOCUMENT',
          phase: 'DAY_1',
          responsible: 'SELF',
          dueDayOffset: 1,
          xpReward: 5,
          seq: 2,
        },
        {
          title: 'Avaliação aos 30 dias',
          category: 'EVALUATION',
          type: 'TASK',
          phase: 'DAY_30',
          responsible: 'MANAGER',
          dueDayOffset: 30,
          xpReward: 15,
          seq: 3,
        },
      ],
    });
    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
  });

  it('rejeita task sem dueDayOffset (Prazo é obrigatório na Estrutura)', async () => {
    const dto = plainToInstance(CreateOnboardingTemplateDto, {
      ...baseTemplate,
      tasks: [
        {
          title: 'Sem prazo',
          category: 'ADMIN',
          type: 'TASK',
          phase: 'PRE_BOARDING',
          responsible: 'HR',
          xpReward: 10,
          seq: 0,
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'tasks')).toBe(true);
  });
});
