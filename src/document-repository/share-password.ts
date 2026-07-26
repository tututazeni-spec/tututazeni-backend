// Share links guardam senha com bcrypt (A2-3) — não sha256 sem salt.
import * as bcrypt from 'bcrypt';
import { BCRYPT_COST_FACTOR } from '../common/config/security.config';

export function hashSharePassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export function verifySharePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
