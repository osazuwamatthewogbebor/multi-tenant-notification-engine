# Multi-Tenant Notification Engine

A notification service that accepts requests over HTTP and delivers them to
Slack, Telegram, or email in the background. The API doesn't wait for those
third-party services to respond — it validates the request, pushes it onto a
queue, and returns immediately.

Built with TypeScript, Express, Redis (BullMQ), and PostgreSQL, running in
Docker.

## Why it's built this way

The main problem this solves: sending a Slack or Telegram message means
making a network call to someone else's API, and those calls can be slow or
fail entirely. If the HTTP handler waits for them, then a slow Slack means a
slow API for every caller, and a Slack outage means requests piling up until
the process runs out of memory.

So ingestion and delivery are split. The API's job is to check the request is
valid and get it onto the queue. A separate worker process pulls jobs off the
queue and does the actual sending, with retries. Callers get a `202 Accepted`
and a message ID they can use to check delivery status later.

## How a request flows through

```
HTTP POST
   │
   ▼
Express API
   │
   ▼
validateTenant middleware ──► Redis (cache hit)
   │                      └─► PostgreSQL (cache miss, then populate cache)
   ▼
NotificationController  (Zod validation of the body)
   │
   ▼
BullMQ queue (Redis)
   │
   │  ... async ...
   ▼
Worker process
   │
   ├──► PostgreSQL  (write log row: PROCESSING → DELIVERED / FAILED)
   │
   └──► Channel strategy ──► Slack / Telegram / Email
```

1. **Tenant check.** The `x-tenant-id` header is looked up in Redis first. On
   a miss, it checks PostgreSQL and caches the result for an hour. Unknown
   tenants are rejected here, before anything else runs.
2. **Body validation.** The request body is parsed with a Zod schema, so
   malformed payloads fail at the edge rather than inside the worker.
3. **Enqueue.** The validated job goes onto a BullMQ queue backed by Redis.
   The HTTP response returns at this point with `202 Accepted`.
4. **Worker picks it up.** BullMQ uses Redis Lua scripts to hand each job to
   exactly one worker, so a job isn't delivered twice if multiple workers are
   running.
5. **Log then send.** The worker writes a `PROCESSING` row to PostgreSQL,
   resolves which channel strategy to use, and makes the outbound call.
6. **Settle.** On success the row becomes `DELIVERED`. On failure it becomes
   `FAILED` with the error recorded, and BullMQ schedules a retry with
   exponential backoff (`2s × 2^attempt`).

## Channels

| Channel  | How it's sent    | Status  |
|----------|------------------|---------|
| Slack    | Incoming webhook | Working |
| Telegram | Bot API          | Working |
| Email    | SMTP             | Planned |

Each channel is a separate strategy class behind a shared interface. Adding
Discord or Twilio means writing one new class and registering it — the queue,
worker, and logging code don't change.

## Decisions I made, and what they cost

**BullMQ over RabbitMQ.** RabbitMQ has much richer routing than I'm using
here, but it's a separate service to run and operate. Redis was already in
the stack for the tenant cache, and BullMQ handles job state atomically
through Lua scripts inside Redis. For this workload that was enough, and it
kept the deployment to three containers instead of four. The cost: if I later
needed fan-out to multiple consumers or topic-based routing, BullMQ would
start fighting me and RabbitMQ would be the better tool.

**202 Accepted instead of waiting for delivery.** Callers don't find out from
the HTTP response whether their message actually reached Slack — they get a
message ID and have to check the log. That's a real downside for anyone who
wants immediate confirmation. I took it because the alternative is the API's
availability being tied to Slack's and Telegram's, which seemed worse.

**No foreign key from `notification_logs.tenant_id` to the tenants table.**
The log table is written to constantly by the worker, and I didn't want every
insert taking a lock against the tenants table. Tenant validity is already
enforced at the API boundary. The tradeoff is honest: the database itself
won't stop a bad `tenant_id` from being written, so this only holds as long
as the middleware is the sole write path. If something else ever writes to
that table directly, this becomes a bug.

## Running it

Needs Docker and Docker Compose.

```bash
# Fresh start, including wiping volumes
docker compose down -v
docker compose up --build
```

You should see Redis and Postgres report healthy, then:

```
[System] Background BullMQ worker initialized successfully.
[System] Multi-Tenant Notification Core running on port 3000
```

### Environment variables

Create a `.env` in the project root:

```env
PORT=3000
NODE_ENV=development

REDIS_HOST=notification_redis
REDIS_PORT=6379

DB_HOST=notification_postgres
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=notifications_db
DB_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@notification_postgres:5432/notifications_db
```

## Trying it out

A tenant `00000000-0000-0000-0000-000000000001` is seeded on startup.

**Valid request:**

```bash
curl -X POST http://localhost:3000/api/v1/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "channel": "SLACK",
    "recipient": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "content": "Test message from the notification engine."
  }'
```

Logs should show the job being queued and then picked up:

```
Enqueued job dispatch:SLACK:00000000-0000-0000-0000-000000000001
[Worker] Processing job 1 for Tenant: 00000000-... via SLACK
```

**Unknown tenant** (should be rejected before reaching the queue):

```bash
curl -X POST http://localhost:3000/api/v1/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: 99999999-9999-9999-9999-999999999999" \
  -d '{"channel":"TELEGRAM","recipient":"123456789","content":"test"}'
```

```json
{
  "status": "fail",
  "message": "Unauthorized access. Provided Tenant ID is not registered."
}
```

## Known gaps

- **No dead letter queue.** Jobs that exhaust their retries are marked
  `FAILED` in Postgres but the job itself is gone. There's no way to inspect
  or replay them.
- **No rate limiting per tenant.** A single tenant can currently flood the
  queue, and nothing stops the worker from hammering a provider hard enough
  to get the webhook banned.
- **Email isn't implemented** — the strategy interface is there, the SMTP
  adapter isn't.
- **No automated tests.** The curl commands above are how I've been checking
  it, which isn't good enough.
- **Retry config is global**, not per-channel. Telegram and Slack have
  different rate limit behaviour and should probably back off differently.

## Stack

Node.js 20 · TypeScript · Express · BullMQ · Redis 7 · PostgreSQL 15 · Zod ·
Docker Compose

## Author

Built by Osazuwa Matthew Ogbebor — [@osazuwamatthewogbebor](https://github.com/osazuwamatthewogbebor)

## License

MIT — see `LICENSE`.
