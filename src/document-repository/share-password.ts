// Share links guardam senha com bcrypt (A2-3) — não sha256 sem salt.
import * as bcrypt from 'bcrypt';

export function hashSharePassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifySharePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
