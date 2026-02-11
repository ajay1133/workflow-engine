import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { ENV_KEYS } from '../constants';
import type { AppEnv } from '../env';
import type { QueueRunRequest, QueueRunResult } from './types';

export type RunExecutor = (request: QueueRunRequest) => Promise<QueueRunResult>;

export class SqsWorker {
  private readonly sqs: SQSClient;
  private readonly env: AppEnv;
  private readonly requestQueueUrl: string;
  private readonly executor: RunExecutor;

  private stopping = false;
  private loopPromise: Promise<void> | null = null;

  constructor(params: {
    sqs: SQSClient;
    env: AppEnv;
    requestQueueUrl: string;
    executor: RunExecutor;
  }) {
    this.sqs = params.sqs;
    this.env = params.env;
    this.requestQueueUrl = params.requestQueueUrl;
    this.executor = params.executor;
  }

  start(): void {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.loopPromise;
    this.loopPromise = null;
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        const response = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.requestQueueUrl,
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: this.env[ENV_KEYS.workerPollWaitSeconds],
            VisibilityTimeout: this.env[ENV_KEYS.workerVisibilityTimeoutSeconds],
          }),
        );

        const message = response.Messages?.[0];
        if (!message || !message.Body || !message.ReceiptHandle) {
          continue;
        }

        const parsed = safeJsonParse(message.Body) as QueueRunRequest | null;
        if (!parsed || parsed.kind !== 'workflow_run_request') {
          await this.sqs.send(
            new DeleteMessageCommand({
              QueueUrl: this.requestQueueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          continue;
        }

        try {
          await this.executor(parsed);
        } catch (err) {
          // If executor throws, at least avoid poison-pill retries by deleting the message.
          // Result delivery is executor responsibility.
        }

        await this.sqs.send(
          new DeleteMessageCommand({
            QueueUrl: this.requestQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      } catch (_err) {
        // For now, keep looping. We'll add structured logging later.
        await sleep(500);
      }
    }
  }
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
