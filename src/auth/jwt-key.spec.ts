import { KeyObject } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { toSecretKeyObject } from './jwt-key';

describe('toSecretKeyObject', () => {
  it('devolve um KeyObject do tipo "secret"', () => {
    const key = toSecretKeyObject('segredo-de-teste');
    expect(key).toBeInstanceOf(KeyObject);
    expect(key.type).toBe('secret');
  });

  it('verifica tokens HS256 assinados com o mesmo segredo em texto', () => {
    const token = jwt.sign({ sub: 1 }, 'segredo-de-teste', { expiresIn: '15m' });
    const payload = jwt.verify(token, toSecretKeyObject('segredo-de-teste')) as jwt.JwtPayload;
    expect(payload.sub).toBe(1);
  });

  it('rejeita tokens assinados com outro segredo', () => {
    const token = jwt.sign({ sub: 1 }, 'outro-segredo', { expiresIn: '15m' });
    expect(() => jwt.verify(token, toSecretKeyObject('segredo-de-teste'))).toThrow(
      'invalid signature',
    );
  });

  it('um segredo que seja um PEM de chave pública não permite aceitar tokens RS256 (confusão de algoritmo)', () => {
    // Antes (segredo em string) o jsonwebtoken tratava um segredo com formato PEM como chave
    // pública e aceitava RS256. Como KeyObject "secret", só HS* é possível.
    const { publicKey, privateKey } = require('crypto').generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const forged = jwt.sign({ sub: 1 }, privateKey, { algorithm: 'RS256' });
    expect(() => jwt.verify(forged, toSecretKeyObject(pem))).toThrow();
  });
});
