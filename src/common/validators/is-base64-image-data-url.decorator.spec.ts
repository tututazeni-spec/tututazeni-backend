// src/common/validators/is-base64-image-data-url.decorator.spec.ts
import { validate } from 'class-validator';
import { IsBase64ImageDataUrl } from './is-base64-image-data-url.decorator';

class Dto {
  @IsBase64ImageDataUrl()
  avatarUrl!: string;
}

async function errorCount(value: unknown): Promise<number> {
  const d = new Dto();
  // @ts-expect-error — testar valores inválidos de propósito
  d.avatarUrl = value;
  return (await validate(d)).length;
}

describe('IsBase64ImageDataUrl', () => {
  it('aceita data URL png base64', async () => {
    expect(await errorCount('data:image/png;base64,iVBORw0KGgo=')).toBe(0);
  });
  it('aceita data URL jpeg base64', async () => {
    expect(await errorCount('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(0);
  });
  it('aceita data URL jpg base64', async () => {
    expect(await errorCount('data:image/jpg;base64,/9j/4AAQ')).toBe(0);
  });
  it('aceita data URL webp base64', async () => {
    expect(await errorCount('data:image/webp;base64,UklGRi4AAABXRUJQ')).toBe(0);
  });
  it('recusa https URL', async () => {
    expect(await errorCount('https://storage.innova.ao/x.png')).toBeGreaterThan(0);
  });
  it('recusa data URL svg', async () => {
    expect(await errorCount('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeGreaterThan(0);
  });
  it('recusa data URL gif', async () => {
    expect(await errorCount('data:image/gif;base64,R0lGODlh')).toBeGreaterThan(0);
  });
  it('recusa data URL não-base64 (texto)', async () => {
    expect(await errorCount('data:image/png,notbase64')).toBeGreaterThan(0);
  });
  it('recusa payload base64 com caracteres inválidos', async () => {
    expect(await errorCount('data:image/png;base64,abc$%^&')).toBeGreaterThan(0);
  });
  it('recusa string vazia', async () => {
    expect(await errorCount('')).toBeGreaterThan(0);
  });
  it('recusa não-string', async () => {
    expect(await errorCount(12345)).toBeGreaterThan(0);
  });
});
