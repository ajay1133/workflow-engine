import jwt from 'jsonwebtoken';

export type JwtUserPayload = {
  sub: string;
  email: string;
  is_admin: boolean;
};

export function signUserJwt(params: {
  jwtSecret: string;
  user: { id: string; email: string; is_admin: boolean };
}): string {
  const payload: JwtUserPayload = {
    sub: params.user.id,
    email: params.user.email,
    is_admin: params.user.is_admin,
  };

  return jwt.sign(payload, params.jwtSecret, {
    expiresIn: '7d',
  });
}

export function verifyUserJwt(params: { jwtSecret: string; token: string }): JwtUserPayload {
  const decoded = jwt.verify(params.token, params.jwtSecret);
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload');
  }

  const { sub, email, is_admin } = decoded as Record<string, unknown>;
  if (typeof sub !== 'string' || typeof email !== 'string' || typeof is_admin !== 'boolean') {
    throw new Error('Invalid token payload');
  }

  return { sub, email, is_admin };
}
