// src/common/validators/optional-image-ref.decorator.ts
// Capa/miniatura opcional: URL https externa OU imagem inline (data URL) verificada pelos bytes.
// Vazio ('') significa "sem imagem" (os formulários enviam assim) e não é validado.
import { MaxLength, ValidateIf } from 'class-validator';
import { FILE_POLICIES, FilePolicy, maxDataUrlChars } from '../files/file-policies';
import { IsUrlOrInlineFile } from './is-url-or-inline-file.decorator';

export function IsOptionalImageRef(policy: FilePolicy = FILE_POLICIES.CARD_IMAGE) {
  return function (object: object, propertyName: string) {
    MaxLength(maxDataUrlChars(policy))(object, propertyName);
    ValidateIf((o: Record<string, unknown>) => !!o[propertyName])(object, propertyName);
    IsUrlOrInlineFile({ policy })(object, propertyName);
  };
}
