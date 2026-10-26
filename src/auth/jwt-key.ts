import { createSecretKey, KeyObject } from 'crypto';

/**
 * Chave de verificação HS* criada uma única vez no arranque.
 *
 * O jsonwebtoken 9 recebe o segredo em texto e, em CADA verify, tenta primeiro
 * createPublicKey() (falha, porque não é PEM) e só depois createSecretKey() — cerca de
 * 750 µs por pedido contra ≈16 µs com um KeyObject. Além disso, um segredo em texto com
 * formato PEM seria tratado como chave pública (confusão de algoritmo HS/RS); um
 * KeyObject "secret" só permite HS*.
 */
export function toSecretKeyObject(secret: string): KeyObject {
  return createSecretKey(Buffer.from(secret));
}
