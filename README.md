# Workflow Engine

## Repo Description
This repo is a small “Zapier-like” workflow app.

You create a workflow (a JSON list of operations), get a unique HTTP trigger URL, and when that URL is called the workflow is queued and executed operation-by-operation. Each run is persisted (status, outputs, errors), and there’s a simple UI to create/edit workflows and view run history.

Workflows are defined as a JSON list of **operations** (flat array). Each operation reads/writes the shared Input object (mutated as it flows through operations).

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

## Smoke Testing
1. Create a workflow: `POST http://localhost:3000/api/workflows`
2. Trigger it: `POST http://localhost:3000/t/<token>`

Or run the automated PowerShell script:

## Operations

Workflows are a flat list of operations. Each operation reads/writes the shared `Input` object (JSON).

Common sample input used below:

```json
{ "key": "test", "value": "test" }
```

### filter.compare
Gates execution based on `Input[key]` compared to a value. If it fails, the workflow run is **skipped**.

Usage:

```json
{ "action": "filter.compare", "key": "key", "condition": "eq", "value": "test" }
```

Sample output (execution step):

```json
{
	"action": "filter.compare",
	"passed": true,
	"details": { "key": "key", "condition": "eq", "expected": "test", "actual": "test" },
	"output": { "key": "test", "value": "test" }
}
```

### transform.default_value
Sets `Input[key]` only when the current value is empty (`null`, `undefined`, or `""`).

Usage:

```json
{ "action": "transform.default_value", "key": "value", "value": "test" }
```

Sample input / output:

```json
{ "key": "test", "value": "" }
```

```json
{ "key": "test", "value": "test" }
```

### transform.replace_template
Renders a template string using `{{dot.path}}` lookups and writes it to `Input[key]`.

Usage:

```json
{ "action": "transform.replace_template", "key": "title", "value": "Replace {{key}} by {{value}}" }
```

Sample output:

```json
{ "key": "test", "value": "test", "title": "Replace test by test" }
```

### transform.pick
Replaces the `Input` object with a new object containing only the listed dot-path keys.

Usage:

```json
{ "action": "transform.pick", "value": ["key", "value"] }
```

### send.http_request
Posts a message to a Slack incoming webhook; supports templated headers/body, `timeoutMs`, and `retries`.

Retry behavior:

Usage:

```json
{
	"action": "send.http_request",
	"method": "POST",
	"url": "https://hooks.slack.com/services/...",
	"headers": { "content-type": "application/json" },
	"body": { "mode": "custom", "value": { "text": "{{value}}" } },
	"timeoutMs": 5000,
	"retries": 2
}
```

Notes:

Sample output (execution step excerpt):

```json
{
	"action": "send.http_request",
	"details": {
		"response": { "ok": false, "status": 500, "attempts": 3, "retriesUsed": 2 }
	},
	"output": { "send_http_retries_used": 2 }
}
```

### if.start / if.end
Conditional block. Steps between `if.start` and `if.end` run only when the condition passes.

Usage (paired block):

```json
[
	{ "action": "if.start", "key": "key", "condition": "eq", "value": "test" },
	{ "action": "transform.default_value", "key": "value", "value": "test" },
	{ "action": "if.end" }
]
```

Security note: Slack incoming webhook URLs are secrets. Don’t commit them to git or paste them into logs.

### while.start / while.end
Loop block. Steps between `while.start` and `while.end` run repeatedly while the condition passes.

Usage (paired block):

```json
[
	{ "action": "while.start", "key": "counter", "condition": "lt", "value": 3 },
	{ "action": "create_or_update", "key": "counter", "increment_by": 1, "default_value": 0 },
	{ "action": "while.end" }
]
```

### create_or_update
Sets `Input[key]` to `default_value` if missing; otherwise increments it by `increment_by`.

Usage:

```json
{ "action": "create_or_update", "key": "value", "increment_by": 1, "default_value": 0 }
```

### Sample workflow (all operations)

```json
[
	{ "action": "filter.compare", "key": "key", "condition": "eq", "value": "test" },
	{ "action": "transform.default_value", "key": "value", "value": "test" },
	{ "action": "transform.replace_template", "key": "msg", "value": "Replace {{key}} by {{value}}" },
	{ "action": "create_or_update", "key": "counter", "increment_by": 0, "default_value": 0 },
	{ "action": "while.start", "key": "counter", "condition": "lt", "value": 3 },
	{ "action": "create_or_update", "key": "counter", "increment_by": 1, "default_value": 0 },
	{ "action": "while.end" },
	{ "action": "if.start", "key": "counter", "condition": "eq", "value": 3 },
	{
		"action": "send.http_request",
		"method": "POST",
		"url": "https://hooks.slack.com/services/...",
		"headers": { "content-type": "application/json" },
		"body": { "mode": "custom", "value": { "text": "{{msg}}" } },
		"timeoutMs": 5000,
		"retries": 2
	},
	{ "action": "if.end" },
	{ "action": "transform.pick", "value": ["key", "value", "msg", "counter", "send_http_ok", "send_http_status"] }
]
```

## Rest

### Run history API

### Example: webhook operation
You can send notifications via the `send.http_request` operation.

```json
[
	{ "action": "transform.replace_template", "key": "msg", "value": "Replace {{key}} by {{value}}" },
	{
		"action": "send.http_request",
		"method": "POST",
		"url": "https://hooks.slack.com/services/...",
		"headers": { "content-type": "application/json" },
		"body": { "mode": "custom", "value": { "content": "{{msg}}" } },
		"timeoutMs": 5000,
		"retries": 2
	}
]
```

Note: `send.http_request.url` must contain the Slack incoming webhook URL directly.

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
