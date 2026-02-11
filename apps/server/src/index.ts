import { loadDotenv } from './dotenv';

loadDotenv();

import { createApp } from './app';
import { loadEnv } from './env';
import { ENV_KEYS } from './constants';
import { createSqsClient, ensureQueueUrl } from './queue/sqsClient';
import { SqsWorker } from './queue/worker';
import { getPrisma, closePrisma } from './db';
import { RunWaiter } from './queue/runWaiter';
import { executeWorkflowRun } from './workflow/executeWorkflowRun';

const env = loadEnv(process.env);
const prisma = getPrisma();

const runWaiter = new RunWaiter();

async function main() {
  const hasAwsCreds = !!env[ENV_KEYS.awsAccessKeyId] && !!env[ENV_KEYS.awsSecretAccessKey];
  const sqs = env[ENV_KEYS.workerEnabled] && hasAwsCreds ? createSqsClient(env) : null;
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
            const result = await executeWorkflowRun({ prisma, req });
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

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
