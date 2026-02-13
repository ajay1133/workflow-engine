# Workflow Engine

## Repo Description
This repo is a small “Zapier-like” workflow app.

You create a workflow (JSON steps), get a unique HTTP trigger URL, and when that URL is called the workflow is queued and executed step-by-step. Each run is persisted (status, outputs, errors), and there’s a simple UI to create/edit workflows and view run history.

Workflows are defined as an ordered list of **steps**. Each step has a `type` and reads/writes the shared `ctx` object (mutated as it flows through steps).

A queue is used to track the order of requests which keeps HTTP triggers fast and reliable: the request enqueues work and a worker processes jobs sequentially.

## Prerequisites

## Technology Stack
	- Reason: decouples triggers from work execution; matches real AWS production usage.
	- Alternatives: Redis + BullMQ, RabbitMQ, Kafka.
	- Reason: no AWS account needed for local work; faster + deterministic; no cloud costs.
	- Alternative: use real AWS SQS with credentials (see Production Deploy).
	- Reason: meets the “single-process / no forking” requirement, since we are using a single Nodejs server it manages workflows asynchronously.
	- Alternative: separate worker service/replicas, serverless AWS Lambda triggered for each workflow (recommended).
	- Alternatives: TypeORM migrations, Knex migrations.

## Setup instructions (Local Run)

### Start infra (Postgres + LocalStack SQS)

Tip: `docker compose` will use defaults from `docker-compose.yml`. To override values, use `docker compose --env-file <path-to-env> up -d ...` or set environment variables in your shell.

Data persistence:

### Install deps

### Configure environment (.env)

Notes:

### Create the DB schema (first time)
On Windows PowerShell:

To create a *new* migration (after editing the Prisma schema), use:

### Run the app (dev)

API will be at `http://localhost:3000` and the web dev server will print its URL (usually `http://localhost:5173`).

## Production Deploy

### Option A: Docker image (monolith)

API will be at `http://localhost:3000`.

If the web build is present (Docker image includes it), the UI is served from:

#### How to pass environment variables on an EC2 host
If you deploy to an EC2 instance and run the app with Docker/Compose, you typically **create an env file on the server** and have Docker read it.

Common approaches:

1) **`docker compose` + `.env` file (recommended for simple EC2 setups)**
	- `docker-compose.yml`
	- a `.env` file (NOT committed to git) containing your real production values

Notes:

2) **`docker run` + `--env-file` (single container)**

3) **AWS-native secrets (recommended as you mature)**

Credential best practice on AWS:

### GitHub Actions CI/CD (staging + qa/uat/prod)
This repo includes a GitHub Actions workflow at `.github/workflows/cicd.yml`.

Behavior:

Required setup in GitHub:
	- `SSH_HOST`
	- `SSH_USER`
	- `SSH_KEY` (private key)

Required setup on each server:

### Option B: Real AWS SQS (instead of LocalStack)
You can point the server at a real SQS queue in AWS (same AWS SDK, no LocalStack).

High level:
	- `AWS_REGION`
	- Credentials via one of:
		- `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (simple/dev)
		- Instance/Task role (recommended for AWS deploys)
	- Remove/omit `SQS_ENDPOINT` so the AWS SDK talks to AWS, not LocalStack.
	- `SQS_REQUEST_QUEUE_NAME` and `SQS_REPLY_QUEUE_NAME` matching the AWS queue names.

Note: the current “trigger waits synchronously for completion” implementation relies on an in-memory waiter, so it’s intentionally single-instance.

### No AWS credentials: synchronous execution (no queue)

If `AWS_ACCESS_KEY_ID` is **blank / not provided**, the server will **not** use SQS at all.
Instead, workflow triggers execute **synchronously in the Node.js process** and return the result directly.

This is useful when you don’t want AWS/LocalStack credentials locally.

To enable queueing via LocalStack SQS again, set both:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## Smoke Testing
1. Create a workflow: `POST http://localhost:3000/api/workflows`
2. Trigger it: `POST http://localhost:3000/t/<token>`

Or run the automated PowerShell script:

## Steps

Workflows are defined as an ordered list of steps. Each step reads/writes the shared `ctx` object (JSON).

Dot-paths:

- Use dotted paths like `body.message` to read/write nested values.
- Arrays can be indexed with numeric segments like `orders.0.status` (bracket notation is not supported).

### filter
Gates execution based on conditions evaluated against `ctx`. If any condition fails, the workflow run is **skipped**.

Usage:

```json
{
	"type": "filter",
	"conditions": [
		{ "path": "key", "op": "eq", "value": "test" },
		{ "path": "value", "op": "neq", "value": "" }
	]
}
```

Notes:

- Only `eq` and `neq` are supported.

### transform
Applies a list of transform ops to `ctx` sequentially:

- `default`: set `ctx[path]` only when empty (`null`, `undefined`, or `""`)
- `template`: render a template string using `{{dot.path}}` lookups and write to `to`
- `pick`: replace `ctx` with an object containing only the selected dot-paths

Usage:

```json
{
	"type": "transform",
	"ops": [
		{ "op": "default", "path": "value", "value": "test" },
		{ "op": "template", "to": "title", "template": "Replace {{key}} by {{value}}" },
		{ "op": "pick", "paths": ["key", "value", "title"] }
	]
}
```

### http_request
Makes an HTTP request. `headers` and `body` may contain templates like `{{title}}`.

Rule:

- If a workflow includes `http_request`, it must be the **last** step.

Body modes:

- `{ "mode": "ctx" }` sends the entire `ctx` as JSON.
- `{ "mode": "custom", "value": <any JSON> }` sends templated JSON.

Response metadata is stored in:

- `ctx.http_response`
- `ctx.http_status`
- `ctx.http_ok`
- `ctx.http_retries_used`

Usage:

```json
{
	"type": "http_request",
	"method": "POST",
	"url": "https://example.com/webhook",
	"headers": { "content-type": "application/json" },
	"body": { "mode": "custom", "value": { "text": "{{title}}" } },
	"timeoutMs": 5000,
	"retries": 2
}
```

Security note: webhook URLs (e.g. Slack incoming webhooks) are secrets. Don’t commit them to git or paste them into logs.

### Sample workflow

```json
[
	{
		"type": "filter",
		"conditions": [
			{ "path": "key", "op": "eq", "value": "test" },
			{ "path": "value", "op": "neq", "value": "" }
		]
	},
	{
		"type": "transform",
		"ops": [
			{ "op": "default", "path": "value", "value": "test" },
			{ "op": "template", "to": "title", "template": "Replace {{key}} by {{value}}" }
		]
	},
	{
		"type": "http_request",
		"method": "POST",
		"url": "https://example.com/webhook",
		"headers": { "content-type": "application/json" },
		"body": { "mode": "custom", "value": { "text": "{{title}}" } },
		"timeoutMs": 5000,
		"retries": 2
	}
]
```

## Rest

### Run history API

### Example: webhook step
You can send notifications via the `http_request` step.

```json
[
	{ "type": "transform", "ops": [{ "op": "template", "to": "msg", "template": "Replace {{key}} by {{value}}" }] },
	{
		"type": "http_request",
		"method": "POST",
		"url": "https://hooks.slack.com/services/...",
		"headers": { "content-type": "application/json" },
		"body": { "mode": "custom", "value": { "content": "{{msg}}" } },
		"timeoutMs": 5000,
		"retries": 2
	}
]
```

Sample input:

```json
{ "key": "test", "value": "test" }
```

Notes:

## Deploying to Render

This repo can be deployed to Render as a single Docker-based Web Service that serves both:
- the API (Express)
- the built web UI (`apps/web/dist` served statically by the server)

### Prerequisites

- A Render account
- A Postgres database (Render can provision this for you)
- For workflow execution via triggers: an SQS-compatible queue
  - Recommended: real AWS SQS in your AWS account (LocalStack is for local dev only)

### Option A (recommended): Render Web Service + AWS SQS

1. Push this repo to GitHub.
2. In Render, create a **New Blueprint** and select the repo.
   - Render will pick up the Blueprint file at the repo root: `render.yaml`.
3. In the created service, set these environment variables (as secrets where appropriate):
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION` (defaults to `us-east-1` in `render.yaml`)

4. Update `PUBLIC_BASE_URL` to match your Render URL (or custom domain).

On deploy, the container entrypoint runs `prisma migrate deploy` and then starts the server.

### Option B: Render Web Service without queues (UI/API only)

If you set `WORKER_ENABLED=false`, the app will start and you can use the UI, but triggers will return "Queue is not configured" and workflows won't execute.

### Security note

If you ever paste a Slack webhook URL into a chat or commit it to git, **rotate it immediately** in Slack (create a new Incoming Webhook URL) and update any workflows that reference it.
		"timeoutMs": 5000,
