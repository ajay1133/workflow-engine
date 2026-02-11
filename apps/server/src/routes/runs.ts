import type { PrismaClient } from '@prisma/client';
import type { Router } from 'express';
import express from 'express';
import { notFound } from '../httpErrors';

export function runsRouter(params: { prisma: PrismaClient }): Router {
  const router = express.Router();
  const { prisma } = params;

  // GET /api/workflows/:id/runs
  router.get('/workflows/:id/runs', async (req, res) => {
    const workflowId = req.params.id;

    const isAdmin = !!req.user?.is_admin;
    const userId = req.user?.id;

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, created_by: true },
    });
    if (!workflow) {
      const err = notFound('Workflow not found');
      return res.status(err.status).json(err.body);
    }

    if (!isAdmin && workflow.created_by !== userId) {
      return res.status(404).json(notFound('Workflow not found').body);
    }

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        workflowId: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        error: true,
      },
    });

    return res.json(runs);
  });

  // GET /api/runs/:id
  router.get('/runs/:id', async (req, res) => {
    const runId = req.params.id;

    const isAdmin = !!req.user?.is_admin;
    const userId = req.user?.id;

    const run = await prisma.workflowRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        workflowId: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        input: true,
        ctxFinal: true,
        executionTrace: true,
        error: true,
        workflow: { select: { created_by: true } },
      },
    });

    if (!run) {
      const err = notFound('Run not found');
      return res.status(err.status).json(err.body);
    }

    if (!isAdmin && run.workflow.created_by !== userId) {
      const err = notFound('Run not found');
      return res.status(err.status).json(err.body);
    }

    // strip workflow relation from response
    const { workflow, ...rest } = run;
    return res.json(rest);
  });

  return router;
}
