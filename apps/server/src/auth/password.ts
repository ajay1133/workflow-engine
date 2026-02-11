import bcrypt from 'bcryptjs';

export async function hashPassword(plain: string): Promise<string> {
  // bcryptjs generates its own salt internally when given a number.
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}
