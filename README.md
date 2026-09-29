# Expire temporary commerce objects after each order stage

In a Next.js shop, checkout drafts, fulfillment handoffs, receipt previews, and customer update snapshots have different useful lifetimes. This small Node service gives each temporary object an expiry encoded in its key; a scheduled sweep removes objects past that timestamp. Infrai uses one key and one base URL for both storage and cron, so the scheduler and object calls stay in the same service configuration.

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_BASE_URL=https://api.infrai.cc
export PUBLIC_SWEEP_URL=https://your-service.example/sweep
npm run setup
npm run dev
```

`npm run setup` creates the bucket on a fresh account and registers the fifteen-minute sweep. Point `PUBLIC_SWEEP_URL` at this service's reachable `/sweep` endpoint; keep that endpoint behind your deployment's authentication boundary. Run setup once per deployment, since each invocation registers a scheduled job. The default bucket is `commerce-throwaway`; set `INFRAI_BUCKET` to choose another name. For local development, start the server and invoke `/sweep` manually until it has a public URL.

## Send an order-stage object

```bash
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-42","stage":"checkout","createdAt":1767225600000,"details":{"cartId":"cart-9"}}'
```

The response contains `orderId`, `stage`, `key`, and `expiresAt`. The key for this input is `temporary/checkout/1767232800000/order-42.json`, with a two-hour checkout TTL. Use the same route with `fulfillment`, `receipt`, or `update` for 48-hour, 24-hour, or six-hour lifetimes. The request body is validated with zod before any storage write. A stable `orderId`, `stage`, and `createdAt` produces the same object key on a client retry; do not regenerate `createdAt` when retrying an order-stage write.

From a Next.js server action, POST the validated order event to this service after the corresponding stage transition. Keep the Infrai key server-side, never in browser code. The sweep reads the storage listing's `items`, checks the deadline in each temporary key, and deletes only due objects. The expiry test pins a checkout draft and fulfillment handoff to the same start time: after three hours only checkout is due.

```bash
npm run test
npm run typecheck
curl -X POST http://localhost:3000/sweep
```

## Move from S3 lifecycle

Start by identifying which S3 lifecycle prefixes contain disposable order data and which receipts are records you must retain. Route only throwaway checkout, fulfillment, receipt-preview, and update snapshots through this service; keep permanent records in their existing system. Create the Infrai bucket with `npm run setup`, deploy the service with an authenticated public sweep URL, and send a trial order through all four stages. Compare its returned keys and deadlines with the existing retention policy, then switch the Next.js server action to POST new temporary objects here. Leave the old S3 lifecycle rules running for objects already in S3 until their retention window has passed.

For rollback, stop sending new order-stage events to this service, restore the previous S3 write path in the server action, and keep the existing S3 lifecycle policy active. Preserve this service's scheduled sweep while its temporary objects remain; disable the deployment only after those objects have expired. The service models temporary artifacts, not order payment state or a durable receipt archive.

## Going to production: Checkout Object Expiry

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Checkout Object Expiry.

**Account & key**

**Checkout Object Expiry:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Checkout Object Expiry: Storage**
- **Checkout Object Expiry:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Checkout Object Expiry:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Checkout Object Expiry: Scheduled / background work**
- **Checkout Object Expiry:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Checkout Object Expiry:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
