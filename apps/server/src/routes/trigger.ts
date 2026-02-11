import type { Prisma, PrismaClient } from '@prisma/client';
import type { Router } from 'express';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { ENV_KEYS, ROUTES } from '../constants';
import type { AppEnv } from '../env';
import { forbidden, notFound, serviceUnavailable } from '../httpErrors';
import type { RunWaiter } from '../queue/runWaiter';
import type { QueueRunRequest, QueueRunResult } from '../queue/types';
import { RUN_STATUS } from '../workflow/types';
import { executeWorkflowRun } from '../workflow/executeWorkflowRun';

export function triggerRouter(params: {
  prisma: PrismaClient;
  env: AppEnv;
  sqs: SQSClient | null;
  requestQueueUrl: string | null;
  runWaiter: RunWaiter;
}): Router {
  const router = express.Router();
  const { prisma, env, sqs, requestQueueUrl, runWaiter } = params;

  router.post(ROUTES.trigger, async (req, res) => {
    const triggerPath = `/t/${req.params.token}`;

    const workflow = await prisma.workflow.findUnique({ where: { triggerPath } });
    if (!workflow) {
      const err = notFound('Workflow trigger not found');
      return res.status(err.status).json(err.body);
    }

    if (!workflow.enabled) {
      const err = forbidden('Workflow is disabled');
      return res.status(err.status).json(err.body);
    }

    const awsAccessKeyId = env[ENV_KEYS.awsAccessKeyId];
    const allowSynchronous = !awsAccessKeyId;

    const input: unknown = req.body ?? {};

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        status: RUN_STATUS.running,
        input: input as Prisma.InputJsonValue,
      },
    });

    const correlationId = uuidv4();

    const msg: QueueRunRequest = {
      kind: 'workflow_run_request',
      correlationId,
      runId: run.id,
      workflowId: workflow.id,
      triggerPath,
      input,
    };

    if (!sqs || !requestQueueUrl) {
      if (!allowSynchronous) {
        const err = serviceUnavailable('Queue is not configured');
        return res.status(err.status).json(err.body);
      }

      // Synchronous mode: execute inline in the Node.js process.
      const result = await executeWorkflowRun({ prisma, req: msg });
      return res.json({
        runId: run.id,
        status: result.status,
        error: result.error ?? null,
        ctxFinal: result.ctxFinal ?? null,
        workflowExecutionSteps: result.workflowExecutionSteps ?? null,
      });
    }

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: requestQueueUrl,
        MessageBody: JSON.stringify(msg),
        MessageAttributes: {
          correlationId: { DataType: 'String', StringValue: correlationId },
          workflowId: { DataType: 'String', StringValue: workflow.id },
          runId: { DataType: 'String', StringValue: run.id },
        },
      }),
    );

    try {
      const result: QueueRunResult = await runWaiter.waitFor(correlationId, env[ENV_KEYS.triggerSyncTimeoutMs]);
      return res.json({
        runId: run.id,
        status: result.status,
        error: result.error ?? null,
        ctxFinal: result.ctxFinal ?? null,
        workflowExecutionSteps: result.workflowExecutionSteps ?? null,
      });
    } catch (err) {
      return res.json({
        runId: run.id,
        status: 'failed',
        error: { message: err instanceof Error ? err.message : 'Unknown error' },
      });
    }
  });

  return router;
}
