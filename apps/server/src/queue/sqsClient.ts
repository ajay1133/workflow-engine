import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  SQSClient,
  type SQSClientConfig,
} from '@aws-sdk/client-sqs';
import { ENV_KEYS } from '../constants';
import type { AppEnv } from '../env';

export function createSqsClient(env: AppEnv): SQSClient {
  const config: SQSClientConfig = {
    region: env[ENV_KEYS.awsRegion],
  };

  if (env[ENV_KEYS.sqsEndpoint]) {
    config.endpoint = env[ENV_KEYS.sqsEndpoint];
  }

  // If credentials are provided, use them; otherwise fall back to default AWS resolution.
  const accessKeyId = env[ENV_KEYS.awsAccessKeyId];
  const secretAccessKey = env[ENV_KEYS.awsSecretAccessKey];
  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  }

  return new SQSClient(config);
}

export async function ensureQueueUrl(params: {
  sqs: SQSClient;
  queueName: string;
}): Promise<string> {
  const { sqs, queueName } = params;

  try {
    const existing = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (!existing.QueueUrl) {
      throw new Error(`Queue URL missing for ${queueName}`);
    }
    return existing.QueueUrl;
  } catch (_err) {
    const created = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    if (!created.QueueUrl) {
      throw new Error(`Failed to create queue ${queueName}`);
    }
    return created.QueueUrl;
  }
}
