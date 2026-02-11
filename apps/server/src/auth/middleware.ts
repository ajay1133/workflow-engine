import type { Request, Response, NextFunction } from 'express';
import type { AppEnv } from '../env';
import { ENV_KEYS } from '../constants';
import { verifyUserJwt, type JwtUserPayload } from './jwt';

export type AuthedUser = {
  id: string;
  email: string;
  is_admin: boolean;
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthedUser;
    jwt?: JwtUserPayload;
  }
}

function parseBearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

export function requireAuth(env: AppEnv) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = parseBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const payload = verifyUserJwt({ jwtSecret: env[ENV_KEYS.jwtSecret], token });
      req.jwt = payload;
      req.user = { id: payload.sub, email: payload.email, is_admin: payload.is_admin };
      return next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}
