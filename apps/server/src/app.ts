import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { API_PREFIX, ENV_KEYS, ROUTES } from './constants';
import type { PrismaClient } from '@prisma/client';
import type { AppEnv } from './env';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { RunWaiter } from './queue/runWaiter';
import { requireAuth } from './auth/middleware';
import { workflowsRouter } from './routes/workflows';
import { triggerRouter } from './routes/trigger';
import { runsRouter } from './routes/runs';
import { authRouter } from './routes/auth';
import { slackRouter } from './routes/slack';

export function createApp(params: {
  env: AppEnv;
  prisma: PrismaClient;
  sqs: SQSClient | null;
  requestQueueUrl: string | null;
  runWaiter: RunWaiter;
}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get(ROUTES.health, (_req, res) => {
    res.json({ ok: true });
  });

  app.use(ROUTES.auth, authRouter({ prisma: params.prisma, env: params.env }));

  app.use(ROUTES.workflows, requireAuth(params.env), workflowsRouter({ prisma: params.prisma, env: params.env }));
  app.use(`${API_PREFIX}/slack`, requireAuth(params.env), slackRouter());
  app.use(API_PREFIX, requireAuth(params.env), runsRouter({ prisma: params.prisma }));
  app.use(
    triggerRouter({
      prisma: params.prisma,
      env: params.env,
      sqs: params.sqs,
      requestQueueUrl: params.requestQueueUrl,
      runWaiter: params.runWaiter,
    }),
  );

  const serveWebDist =
    params.env[ENV_KEYS.nodeEnv] === 'production' || params.env[ENV_KEYS.serveWebDist] === true;

  const webDistDir = path.resolve(__dirname, '../../web/dist');
  const indexHtml = path.join(webDistDir, 'index.html');
  if (serveWebDist && fs.existsSync(indexHtml)) {
    app.use(express.static(webDistDir));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith(API_PREFIX) || req.path.startsWith('/t/') || req.path === ROUTES.health) {
        return next();
      }
      return res.sendFile(indexHtml);
    });
  }

  return app;
}
