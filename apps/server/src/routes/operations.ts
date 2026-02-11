import type { Prisma, PrismaClient } from '@prisma/client';
import type { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../httpErrors';

const OP_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{2,80}$/;
const RESERVED_OPS = new Set(['default', 'template', 'pick']);

const attributeSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.string().min(0).max(5000),
});

const createSchema = z.object({
  op: z.string().regex(OP_ID_PATTERN, 'Invalid op identifier'),
  visibility: z.enum(['private', 'public']).optional().default('private'),
  callbackType: z.enum(['default', 'template', 'pick']),
  attributes: z.array(attributeSchema).default([]),
});

const patchSchema = z
  .object({
    visibility: z.enum(['private', 'public']).optional(),
    callbackType: z.enum(['default', 'template', 'pick']).optional(),
    attributes: z.array(attributeSchema).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'Body must include at least one field');

function canEdit(params: { isAdmin: boolean; userId: string; ownerId: string }): boolean {
  return params.isAdmin || params.userId === params.ownerId;
}

export function operationsRouter(params: { prisma: PrismaClient }): Router {
  const router = express.Router();
  const { prisma } = params;

  // GET /api/operations
  router.get('/', async (req, res) => {
    const isAdmin = !!req.user?.is_admin;
    const userId = req.user!.id;

    const rows = await prisma.operationTemplate.findMany({
      where: isAdmin
        ? undefined
        : {
            OR: [{ visibility: 'public' }, { created_by: userId }],
          },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, email: true } } },
    });

    res.json(
      rows.map((r) => ({
        id: r.id,
        op: r.op,
        visibility: r.visibility,
        callbackType: r.callbackType,
        attributes: r.attributes,
        owner: { id: r.createdBy.id, email: r.createdBy.email },
        canEdit: canEdit({ isAdmin, userId, ownerId: r.created_by }),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
  });

  // GET /api/operations/:id
  router.get('/:id', async (req, res) => {
    const id = req.params.id;
    const isAdmin = !!req.user?.is_admin;
    const userId = req.user!.id;

    const row = await prisma.operationTemplate.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, email: true } } },
    });

    if (!row) {
      const err = notFound('Operation not found');
      return res.status(err.status).json(err.body);
    }

    if (!isAdmin && row.visibility !== 'public' && row.created_by !== userId) {
      const err = notFound('Operation not found');
      return res.status(err.status).json(err.body);
    }

    return res.json({
      id: row.id,
      op: row.op,
      visibility: row.visibility,
      callbackType: row.callbackType,
      attributes: row.attributes,
      owner: { id: row.createdBy.id, email: row.createdBy.email },
      canEdit: canEdit({ isAdmin, userId, ownerId: row.created_by }),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });

  // POST /api/operations
  router.post('/', async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = badRequest('Invalid operation payload', parsed.error.flatten());
      return res.status(err.status).json(err.body);
    }

    if (RESERVED_OPS.has(parsed.data.op)) {
      const err = badRequest('Invalid operation payload', { op: ['Reserved op identifier'] });
      return res.status(err.status).json(err.body);
    }

    const userId = req.user!.id;

    try {
      const created = await prisma.operationTemplate.create({
        data: {
          op: parsed.data.op,
          visibility: parsed.data.visibility,
          callbackType: parsed.data.callbackType,
          attributes: parsed.data.attributes as Prisma.InputJsonValue,
          created_by: userId,
        },
      });

      return res.status(201).json({
        id: created.id,
        op: created.op,
        visibility: created.visibility,
        callbackType: created.callbackType,
        attributes: created.attributes,
        owner: { id: userId, email: req.user!.email },
        canEdit: true,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      });
    } catch {
      const err = badRequest('Invalid operation payload', { op: ['op must be globally unique'] });
      return res.status(err.status).json(err.body);
    }
  });

  // PATCH /api/operations/:id
  router.patch('/:id', async (req, res) => {
    const id = req.params.id;
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = badRequest('Invalid operation payload', parsed.error.flatten());
      return res.status(err.status).json(err.body);
    }

    const isAdmin = !!req.user?.is_admin;
    const userId = req.user!.id;

    const existing = await prisma.operationTemplate.findUnique({ where: { id } });
    if (!existing) {
      const err = notFound('Operation not found');
      return res.status(err.status).json(err.body);
    }

    if (!canEdit({ isAdmin, userId, ownerId: existing.created_by })) {
      const err = notFound('Operation not found');
      return res.status(err.status).json(err.body);
    }

    const updated = await prisma.operationTemplate.update({
      where: { id },
      data: {
        ...(parsed.data.visibility !== undefined ? { visibility: parsed.data.visibility } : {}),
        ...(parsed.data.callbackType !== undefined ? { callbackType: parsed.data.callbackType } : {}),
        ...(parsed.data.attributes !== undefined
          ? { attributes: parsed.data.attributes as Prisma.InputJsonValue }
          : {}),
      },
    });

    return res.json({
      id: updated.id,
      op: updated.op,
      visibility: updated.visibility,
      callbackType: updated.callbackType,
      attributes: updated.attributes,
      canEdit: true,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  });

  // DELETE /api/operations/:id
  router.delete('/:id', async (req, res) => {
    const id = req.params.id;
    const isAdmin = !!req.user?.is_admin;
    const userId = req.user!.id;

    const existing = await prisma.operationTemplate.findUnique({ where: { id } });
    if (!existing) {
      const err = notFound('Operation not found');
      return res.status(err.status).json(err.body);
    }

    if (!canEdit({ isAdmin, userId, ownerId: existing.created_by })) {
      const err = notFound('Operation not found');
      return res.status(err.status).json(err.body);
    }

    await prisma.operationTemplate.delete({ where: { id } });
    return res.status(204).send();
  });

  return router;
}
