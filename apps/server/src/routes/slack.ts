import type { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { badRequest } from '../httpErrors';
import type { AppEnv } from '../env';
import { ENV_KEYS } from '../constants';
import { executeHttpRequest } from '../workflow/httpRequest';

const slackWebhookUrlSchema = z
  .string()
  .min(1)
  .refine((raw) => {
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== 'https:') return false;
      if (u.hostname !== 'hooks.slack.com') return false;
      return /^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(u.pathname);
    } catch {
      return false;
    }
  }, 'Invalid Slack webhook url');

const slackWebhookOrEnvSchema = z
  .string()
  .min(1)
  .refine((raw) => {
    const value = raw.trim();
    if (value.startsWith('env:')) return value.slice('env:'.length).trim().length > 0;
    return slackWebhookUrlSchema.safeParse(value).success;
  }, 'Invalid Slack webhook url');

const testSlackSchema = z.object({
  url: slackWebhookOrEnvSchema,
  text: z.string().min(1).max(2000),
  timeoutMs: z.coerce.number().int().min(100).max(30_000).optional().default(10_000),
  retries: z.coerce.number().int().min(0).max(10).optional().default(0),
});

function resolveEnvUrl(raw: string, env: AppEnv): string | null {
  const value = raw.trim();
  if (!value.startsWith('env:')) return value;
  const key = value.slice('env:'.length).trim();
  const resolved = (env as any)?.[key];
  return typeof resolved === 'string' && resolved.trim() ? resolved.trim() : null;
}

export function slackRouter(params: { env: AppEnv }): Router {
  const router = express.Router();
  const { env } = params;

  // POST /api/slack/test
  router.post('/test', async (req, res) => {
    const parsed = testSlackSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = badRequest('Invalid request', parsed.error.flatten());
      return res.status(err.status).json(err.body);
    }

    const resolvedUrl = resolveEnvUrl(parsed.data.url, env);
    if (!resolvedUrl) {
      const err = badRequest('Invalid request', { url: ['Missing or empty env var'] });
      return res.status(err.status).json(err.body);
    }

    // If it was env-based, validate the resolved value is a Slack webhook too.
    if (!slackWebhookUrlSchema.safeParse(resolvedUrl).success) {
      const err = badRequest('Invalid request', { url: ['Resolved url is not a valid Slack webhook url'] });
      return res.status(err.status).json(err.body);
    }

    const result = await executeHttpRequest({
      step: {
        method: 'POST',
        url: resolvedUrl,
        headers: { 'content-type': 'application/json' },
        timeoutMs: parsed.data.timeoutMs,
        retries: parsed.data.retries,
      },
      jsonBody: { text: parsed.data.text },
    });

    return res.json({
      ok: result.ok,
      status: result.status,
      bodyText: result.bodyText,
      attempts: result.attempts,
      retriesUsed: result.retriesUsed,
      error: result.error,
      usedEnvDefault: parsed.data.url.trim() === `env:${ENV_KEYS.slackWebhookUrl}`,
    });
  });

  return router;
}
