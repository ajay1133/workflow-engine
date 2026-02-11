import { loadDotenv } from './dotenv';

loadDotenv();

import { createApp } from './app';
import { loadEnv } from './env';
import { ENV_KEYS } from './constants';
import { createSqsClient, ensureQueueUrl } from './queue/sqsClient';
import { SqsWorker } from './queue/worker';
import { getPrisma, closePrisma } from './db';
import { RunWaiter } from './queue/runWaiter';
import { runWorkflowSteps } from './workflow/engine';
import { RUN_STATUS } from './workflow/types';
import { workflowStepsSchema } from '@workflow/shared';
import type { WorkflowRunResultStatus } from './queue/types';
import type { Prisma } from '@prisma/client';

const env = loadEnv(process.env);
const prisma = getPrisma();

const runWaiter = new RunWaiter();

async function main() {
  const sqs = env[ENV_KEYS.workerEnabled] ? createSqsClient(env) : null;
  const requestQueueUrl = sqs
    ? await ensureQueueUrl({ sqs, queueName: env[ENV_KEYS.sqsRequestQueueName] })
    : null;

  const app = createApp({
    env,
    prisma,
    sqs,
    requestQueueUrl,
    runWaiter,
  });

  const server = app.listen(env[ENV_KEYS.port], () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on :${env[ENV_KEYS.port]}`);
  });

  const worker =
    sqs && requestQueueUrl
      ? new SqsWorker({
          sqs,
          env,
          requestQueueUrl,
          executor: async (req) => {
            const workflow = await prisma.workflow.findUnique({ where: { id: req.workflowId } });
            if (!workflow) {
              const result = {
                kind: 'workflow_run_result' as const,
                correlationId: req.correlationId,
                runId: req.runId,
                workflowId: req.workflowId,
                status: 'failed' as const,
                error: { message: 'Workflow not found' },
                finishedAt: new Date().toISOString(),
              };

              await prisma.workflowRun.update({
                where: { id: req.runId },
                data: {
                  status: RUN_STATUS.failed,
                  finishedAt: new Date(result.finishedAt),
                  error: result.error as Prisma.InputJsonValue,
                },
              });

              runWaiter.resolve(req.correlationId, result);
              return result;
            }

            const initialCtx = {
              ...inputToCtx(req.input),
              workflow_id: workflow.id,
              run_id: req.runId,
            };

            let steps;
            try {
              steps = workflowStepsSchema.parse(workflow.steps);
            } catch (err) {
              const finishedAtIso = new Date().toISOString();
              const error = {
                message: 'Invalid workflow steps in database',
                details: err instanceof Error ? err.message : err,
              };

              await prisma.workflowRun.update({
                where: { id: req.runId },
                data: {
                  status: RUN_STATUS.failed,
                  finishedAt: new Date(finishedAtIso),
                  error: error as Prisma.InputJsonValue,
                },
              });

              const result = {
                kind: 'workflow_run_result' as const,
                correlationId: req.correlationId,
                runId: req.runId,
                workflowId: req.workflowId,
                status: 'failed' as const,
                error,
                finishedAt: finishedAtIso,
              };

              runWaiter.resolve(req.correlationId, result);
              return result;
            }

            let engineResult;
            try {
              engineResult = await runWorkflowSteps({
                steps,
                initialCtx,
              });
            } catch (err) {
              const finishedAtIso = new Date().toISOString();
              const error = {
                message: 'Workflow execution threw an exception',
                details: err instanceof Error ? err.message : err,
              };

              await prisma.workflowRun.update({
                where: { id: req.runId },
                data: {
                  status: RUN_STATUS.failed,
                  finishedAt: new Date(finishedAtIso),
                  error: error as Prisma.InputJsonValue,
                },
              });

              const result = {
                kind: 'workflow_run_result' as const,
                correlationId: req.correlationId,
                runId: req.runId,
                workflowId: req.workflowId,
                status: 'failed' as const,
                error,
                finishedAt: finishedAtIso,
              };

              runWaiter.resolve(req.correlationId, result);
              return result;
            }

            const finishedAtIso = new Date().toISOString();

            const finalStatus =
              engineResult.status === 'success'
                ? RUN_STATUS.success
                : engineResult.status === 'skipped'
                  ? RUN_STATUS.skipped
                  : RUN_STATUS.failed;

            const resultStatus: WorkflowRunResultStatus =
              finalStatus === RUN_STATUS.success
                ? 'success'
                : finalStatus === RUN_STATUS.skipped
                  ? 'skipped'
                  : 'failed';

            await prisma.workflowRun.update({
              where: { id: req.runId },
              data: {
                status: finalStatus,
                finishedAt: new Date(finishedAtIso),
                ctxFinal: engineResult.ctx as Prisma.InputJsonValue,
                executionTrace: engineResult.trace as Prisma.InputJsonValue,
                error:
                  engineResult.status === 'failed'
                    ? (engineResult.error as Prisma.InputJsonValue)
                    : undefined,
              },
            });

            const result = {
              kind: 'workflow_run_result' as const,
              correlationId: req.correlationId,
              runId: req.runId,
              workflowId: req.workflowId,
              status: resultStatus,
              ctxFinal: engineResult.ctx,
              workflowExecutionSteps: engineResult.trace.workflowExecutionSteps,
              error: engineResult.status === 'failed' ? engineResult.error : undefined,
              finishedAt: finishedAtIso,
            };

            runWaiter.resolve(req.correlationId, result);
            return result;
          },
        })
      : null;

  worker?.start();

  const shutdown = async () => {
    await worker?.stop();
    server.close(() => {
      void closePrisma().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function inputToCtx(input: unknown): Record<string, unknown> {
  if (isPlainObject(input)) return input;
  return { payload: input };
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
