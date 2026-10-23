import 'reflect-metadata';
import { DocumentRepositoryController } from '../../src/document-repository/document-repository.controller';
import { DocumentDeclarationsController } from '../../src/declarations/declarations.controller';
import { WorkDeclarationController } from '../../src/work-declaration/work-declaration.controller';
import { ResolveShareDto } from '../../src/document-repository/document-repository.dto';
import {
  PUBLIC_VERIFY_THROTTLE,
  PUBLIC_SHARE_THROTTLE,
} from '../../src/common/security/public-throttle';

// Endpoints @Public que aceitam um segredo/código adivinhável têm de ter rate-limit próprio
// (código de verificação → enumeração; password de link de partilha → brute-force).
const limitOf = (fn: unknown) => Reflect.getMetadata('THROTTLER:LIMITdefault', fn as object);

describe('rate-limit dos endpoints públicos', () => {
  it.each([
    [
      'DocumentDeclarationsController.verify',
      (DocumentDeclarationsController.prototype as any).verify,
    ],
    [
      'WorkDeclarationController.verifyDeclaration',
      (WorkDeclarationController.prototype as any).verifyDeclaration,
    ],
  ])('%s tem @Throttle de verificação', (_n, fn) => {
    expect(limitOf(fn)).toBe(PUBLIC_VERIFY_THROTTLE.default.limit);
  });

  it('share (GET e POST) tem @Throttle estrito', () => {
    const proto = DocumentRepositoryController.prototype as any;
    expect(limitOf(proto.resolveShare)).toBe(PUBLIC_SHARE_THROTTLE.default.limit);
    expect(limitOf(proto.resolveShareWithPassword)).toBe(PUBLIC_SHARE_THROTTLE.default.limit);
  });

  it('POST share/:token recebe a password no corpo (não na query string)', () => {
    const proto = DocumentRepositoryController.prototype as any;
    expect(Reflect.getMetadata('method', proto.resolveShareWithPassword)).toBe(1); // RequestMethod.POST
    expect(ResolveShareDto).toBeDefined();
  });
});
