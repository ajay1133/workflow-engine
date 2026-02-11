import { SQSClient } from '@aws-sdk/client-sqs';
import { loadEnv } from '../env';
import { ENV_KEYS } from '../constants';
import { createSqsClient } from './sqsClient';

test('createSqsClient builds client with endpoint when provided', () => {
  const env = loadEnv({
    PORT: '3000',
    NODE_ENV: 'test',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://x',
    JWT_SECRET: '0123456789abcdef',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
    SQS_ENDPOINT: 'http://localhost:4566',
    [ENV_KEYS.workerEnabled]: 'false',
  });

  const sqs = createSqsClient(env);
  expect(sqs).toBeInstanceOf(SQSClient);
});
