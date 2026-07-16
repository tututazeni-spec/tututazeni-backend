import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GlobalSearchDto, TypedSearchDto, AutocompleteDto } from './search.dto';

async function errorsFor<T extends object>(
  cls: new () => T,
  value: Record<string, unknown>,
): Promise<string[]> {
  const obj = plainToInstance(cls, value);
  const errors = await validate(obj);
  return errors.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('Search DTOs — limit máximo', () => {
  describe('GlobalSearchDto', () => {
    it('aceita limit=100', async () => {
      expect(await errorsFor(GlobalSearchDto, { q: 'test', limit: 100 })).toHaveLength(0);
    });
    it('rejeita limit=101', async () => {
      expect((await errorsFor(GlobalSearchDto, { q: 'test', limit: 101 })).length).toBeGreaterThan(
        0,
      );
    });
    it('aceita limit omitido', async () => {
      expect(await errorsFor(GlobalSearchDto, { q: 'test' })).toHaveLength(0);
    });
  });

  describe('TypedSearchDto', () => {
    it('aceita limit=100', async () => {
      expect(await errorsFor(TypedSearchDto, { q: 'test', limit: 100 })).toHaveLength(0);
    });
    it('rejeita limit=101', async () => {
      expect((await errorsFor(TypedSearchDto, { q: 'test', limit: 101 })).length).toBeGreaterThan(
        0,
      );
    });
  });

  describe('AutocompleteDto', () => {
    it('aceita limit=100', async () => {
      expect(await errorsFor(AutocompleteDto, { q: 'ac', limit: 100 })).toHaveLength(0);
    });
    it('rejeita limit=101', async () => {
      expect((await errorsFor(AutocompleteDto, { q: 'ac', limit: 101 })).length).toBeGreaterThan(0);
    });
  });
});
