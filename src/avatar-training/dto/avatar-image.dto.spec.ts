import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTrainingAvatarDto } from './avatar-training.dto';

const check = async (imageUrl: string) =>
  validate(plainToInstance(CreateTrainingAvatarDto, { name: 'Isis', imageUrl }));
const png = (bytes: number) => `data:image/png;base64,${Buffer.alloc(bytes, 1).toString('base64')}`;

describe('CreateTrainingAvatarDto.imageUrl', () => {
  it('aceita ligação e imagem inline até 5 MB', async () => {
    expect(await check('https://cdn.example.com/a.png')).toHaveLength(0);
    expect(await check(png(1024))).toHaveLength(0);
  });
  it('rejeita imagem inline acima de 5 MB', async () => {
    expect(await check(png(5 * 1024 * 1024 + 10))).not.toHaveLength(0);
  });
  it('rejeita ficheiro inline que não é imagem', async () => {
    const pdf = `data:application/pdf;base64,${Buffer.alloc(100).toString('base64')}`;
    expect(await check(pdf)).not.toHaveLength(0);
  });
});
