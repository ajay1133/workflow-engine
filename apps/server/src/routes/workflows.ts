import type { PrismaClient } from '@prisma/client';
import type { Router } from 'express';
import express from 'express';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { badRequest, notFound } from '../httpErrors';
import { createWorkflowBodySchema, updateWorkflowBodySchema } from '../workflow/validation';
import { ENV_KEYS } from '../constants';
import type { AppEnv } from '../env';

function randomTriggerPath(): string {
  // 32 hex chars
  const token = uuidv4().replace(/-/g, '');
  return `/t/${token}`;
}

async function suggestNextWorkflowId(prisma: PrismaClient, userId: string): Promise<string> {
  const users = await prisma.user.findMany({
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const ownerIndex = Math.max(1, users.findIndex((u: { id: string }) => u.id === userId) + 1);
  const count = await prisma.workflow.count({ where: { created_by: userId } });
  // IDs are used in URLs; callers must URL-encode them.
  // Shape: <ownerIndexInTotalUsers>/<n>
  return `${ownerIndex}/${count + 1}`;
}

async function suggestNextWorkflowName(prisma: PrismaClient, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const email = user?.email ?? 'user';
  const count = await prisma.workflow.count({ where: { created_by: userId } });
  const n = count + 1;
  const suffix = `-workflow-${n}`;

  // Server validation caps name length at 200.
  const max = 200;
  const allowedEmailLength = Math.max(1, max - suffix.length);
  const emailTruncated = email.length > allowedEmailLength ? email.slice(0, allowedEmailLength) : email;
  return `${emailTruncated}${suffix}`;
}

function isUniqueConstraintError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as any).code === 'P2002';
}

export function workflowsRouter(params: { prisma: PrismaClient; env: AppEnv }): Router {
  const router = express.Router();
  const { prisma, env } = params;

  function withTriggerShape(w: any) {
    return {
      ...w,
      trigger: {
        type: 'http',
      },
      triggerUrl: `${env[ENV_KEYS.publicBaseUrl]}${w.triggerPath}`,
    };
  }

  router.get('/', async (req, res) => {
    const isAdmin = !!req.user?.is_admin;
    const userId = req.user!.id;

    const rows = await prisma.workflow.findMany({
      where: isAdmin ? undefined : { created_by: userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(withTriggerShape));
  });

  // GET /api/workflows/defaults
  // Suggests default id/name for a new workflow for the current user.
  router.get('/defaults', async (req, res) => {
    const userId = req.user!.id;
    const id = await suggestNextWorkflowId(prisma, userId);
    const name = await suggestNextWorkflowName(prisma, userId);
    return res.json({ id, name });
  });

  router.get('/:id', async (req, res) => {
    const id = req.params.id;

    const isAdmin = !!req.user?.is_admin;
    const userId = req.user!.id;

    const row = await prisma.workflow.findFirst({
      where: isAdmin ? { id } : { id, created_by: userId },
    });
    if (!row) {
      const err = notFound('Workflow not found');
      return res.status(err.status).json(err.body);
    }
    res.json(withTriggerShape(row));
  });

  router.post('/', async (req, res) => {
    const parsed = createWorkflowBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = badRequest('Invalid workflow payload', parsed.error.flatten());
      return res.status(err.status).json(err.body);
    }

    const userId = req.user!.id;

    const requestedId = parsed.data.id;
    const baseSuggestedId = requestedId ?? (await suggestNextWorkflowId(prisma, userId));

    // If the client didn't provide an id, we may race with another create.
    // Retry a few times on unique constraint collisions.
    const maxAttempts = requestedId ? 1 : 10;
    let created: any = null;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const baseParts = String(baseSuggestedId).split('/');
      const basePrefix = baseParts[0];
      const baseN = Number(baseParts[baseParts.length - 1] ?? '0');

      const id = requestedId
        ? requestedId
        : attempt === 0
          ? baseSuggestedId
          : `${basePrefix}/${baseN + attempt}`;

      try {
        created = await prisma.workflow.create({
          data: {
            id,
            name: parsed.data.name,
            enabled: parsed.data.enabled,
            triggerPath: randomTriggerPath(),
            steps: parsed.data.steps as any,
            created_by: userId,
          },
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (!isUniqueConstraintError(e)) break;
      }
    }

    if (!created) {
      if (requestedId && isUniqueConstraintError(lastErr)) {
        return res.status(409).json({ message: 'Workflow id already exists' });
      }
      throw lastErr;
    }

    res.status(201).json({
      ...withTriggerShape(created),
    });
  });

  router.patch('/:id', async (req, res) => {
    const id = req.params.id;

    const parsed = updateWorkflowBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = badRequest('Invalid workflow payload', parsed.error.flatten());
      return res.status(err.status).json(err.body);
    }

    const isAdmin = !!req.user?.is_admin;
    const userId = req.user!.id;

    const existing = await prisma.workflow.findFirst({
      where: isAdmin ? { id } : { id, created_by: userId },
    });
    if (!existing) {
      const err = notFound('Workflow not found');
      return res.status(err.status).json(err.body);
    }

    const updated = await prisma.workflow.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.steps !== undefined
          ? { steps: parsed.data.steps as any }
          : {}),
      },
    });

    res.json(withTriggerShape(updated));
  });

  router.delete('/:id', async (req, res) => {
    const id = req.params.id;

    const isAdmin = !!req.user?.is_admin;
    const userId = req.user!.id;

    const existing = await prisma.workflow.findFirst({
      where: isAdmin ? { id } : { id, created_by: userId },
    });
    if (!existing) {
      const err = notFound('Workflow not found');
      return res.status(err.status).json(err.body);
    }

    await prisma.workflow.delete({ where: { id } });
    res.status(204).send();
  });

  return router;
}
