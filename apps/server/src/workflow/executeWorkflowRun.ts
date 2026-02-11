import type { Prisma, PrismaClient } from '@prisma/client';
import { workflowStepsSchema } from '@workflow/shared';
import type {
  QueueRunRequest,
  QueueRunResult,
  WorkflowRunResultStatus,
} from '../queue/types';
import { RUN_STATUS } from './types';
import { runWorkflowSteps } from './engine';

export async function executeWorkflowRun(params: {
  prisma: PrismaClient;
  req: QueueRunRequest;
}): Promise<QueueRunResult> {
  const { prisma, req } = params;

  const workflow = await prisma.workflow.findUnique({ where: { id: req.workflowId } });
  if (!workflow) {
    const result: QueueRunResult = {
      kind: 'workflow_run_result',
      correlationId: req.correlationId,
      runId: req.runId,
      workflowId: req.workflowId,
      status: 'failed',
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

    return {
      kind: 'workflow_run_result',
      correlationId: req.correlationId,
      runId: req.runId,
      workflowId: req.workflowId,
      status: 'failed',
      error,
      finishedAt: finishedAtIso,
    };
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

    return {
      kind: 'workflow_run_result',
      correlationId: req.correlationId,
      runId: req.runId,
      workflowId: req.workflowId,
      status: 'failed',
      error,
      finishedAt: finishedAtIso,
    };
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
      error: engineResult.status === 'failed' ? (engineResult.error as Prisma.InputJsonValue) : undefined,
    },
  });

  return {
    kind: 'workflow_run_result',
    correlationId: req.correlationId,
    runId: req.runId,
    workflowId: req.workflowId,
    status: resultStatus,
    ctxFinal: engineResult.ctx,
    workflowExecutionSteps: engineResult.trace.workflowExecutionSteps,
    error: engineResult.status === 'failed' ? engineResult.error : undefined,
    finishedAt: finishedAtIso,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function inputToCtx(input: unknown): Record<string, unknown> {
  if (isPlainObject(input)) return input;
  return { payload: input };
}
