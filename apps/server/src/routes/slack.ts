import type { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { badRequest } from '../httpErrors';
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

const testSlackSchema = z.object({
  url: slackWebhookUrlSchema,
  text: z.string().min(1).max(2000),
  timeoutMs: z.coerce.number().int().min(100).max(30_000).optional().default(10_000),
  retries: z.coerce.number().int().min(0).max(10).optional().default(0),
});

export function slackRouter(): Router {
  const router = express.Router();

  // POST /api/slack/test
  router.post('/test', async (req, res) => {
    const parsed = testSlackSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = badRequest('Invalid request', parsed.error.flatten());
      return res.status(err.status).json(err.body);
    }

    const result = await executeHttpRequest({
      step: {
        method: 'POST',
        url: parsed.data.url,
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
    });
  });

  return router;
}
