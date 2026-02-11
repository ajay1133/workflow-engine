import type { PrismaClient } from '@prisma/client';
import type { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { ENV_KEYS } from '../constants';
import { hashPassword, verifyPassword } from '../auth/password';
import { signUserJwt } from '../auth/jwt';
import { requireAuth } from '../auth/middleware';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupBodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export function authRouter(params: { prisma: PrismaClient; env: AppEnv }): Router {
  const router = express.Router();
  const { prisma, env } = params;

  router.post('/signup', async (req, res) => {
    const parsed = signupBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid signup payload' });
    }

    const email = parsed.data.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: {
        email,
        password_hash,
        is_admin: false,
      },
    });

    const token = signUserJwt({ jwtSecret: env[ENV_KEYS.jwtSecret], user });
    return res.status(201).json({
      token,
      user: { id: user.id, email: user.email, is_admin: user.is_admin },
    });
  });

  router.post('/login', async (req, res) => {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid login payload' });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await verifyPassword(parsed.data.password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signUserJwt({ jwtSecret: env[ENV_KEYS.jwtSecret], user });

    return res.json({
      token,
      user: { id: user.id, email: user.email, is_admin: user.is_admin },
    });
  });

  router.get('/me', requireAuth(env), async (req, res) => {
    return res.json({ user: req.user });
  });

  return router;
}
