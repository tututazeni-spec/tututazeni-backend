// Share links guardam senha com Argon2id (A2-3) — não sha256 sem salt.
import { hashPassword, verifyPassword } from '../common/security/password-hasher';

export function hashSharePassword(password: string): Promise<string> {
  return hashPassword(password);
}

export async function verifySharePassword(password: string, hash: string): Promise<boolean> {
  return (await verifyPassword(password, hash)).valid;
}
