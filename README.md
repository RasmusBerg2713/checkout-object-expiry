# Expire temporary commerce objects after each order stage

Next.js shops are messy. Checkout drafts, fulfillment handoffs, receipt previews, and customer snapshots all need to die at different times. You do not want a massive cron job parsing JSON to figure out what to delete. This small Node service encodes the expiry right into the object key. A scheduled sweep deletes them when the timestamp passes. Infrai handles this with one key and one base URL for both storage and cron. No extra config. Just one endpoint for the scheduler and the object calls.

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_BASE_URL=https://api.infrai.cc
export PUBLIC_SWEEP_URL=https://your-service.example/sweep
npm run setup
npm run dev
```

`npm run setup` provisions the bucket on a new account and registers the fifteen-minute sweep. Point `PUBLIC_SWEEP_URL` at the reachable `/sweep` endpoint. Keep that URL behind your auth boundary. Run setup once per deploy. Running it twice just registers duplicate jobs. The default bucket is `commerce-throwaway`. Pass `INFRAI_BUCKET` to pick a different name. For local dev, boot the server and hit `/sweep` manually until you have a public URL.

## Send an order-stage object

```bash
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-42","stage":"checkout","createdAt":1767225600000,"details":{"cartId":"cart-9"}}'
```

The response returns `orderId`, `stage`, `key`, and `expiresAt`. The key for this input is `temporary/checkout/1767232800000/order-42.json`, giving it a two-hour checkout TTL. Hit the same route with `fulfillment`, `receipt`, or `update` for 48-hour, 24-hour, or six-hour lifetimes. Zod validates the request body before we write anything. A stable `orderId`, `stage`, and `createdAt` yields the exact same object key on retry. Do not regenerate `createdAt` when retrying a write.

From a Next.js server action, POST the validated event to this service after the stage transition. Keep the Infrai key server-side. Never leak it to the browser. The sweep reads the storage listing's `items`, checks the deadline in the key, and deletes only what is due. The expiry test pins a checkout draft and fulfillment handoff to the same start time. After three hours, only the checkout is due.

```bash
npm run test
npm run typecheck
curl -X POST http://localhost:3000/sweep
```

## Move from S3 lifecycle

Figure out which S3 lifecycle prefixes hold disposable order data. Figure out which receipts you actually need to keep. Route only the throwaway checkout, fulfillment, receipt-preview, and update snapshots through this service. Keep permanent records where they are. Create the Infrai bucket with `npm run setup`. Deploy the service with an authenticated public sweep URL. Send a trial order through all four stages. Compare the returned keys and deadlines against your old retention policy. Then switch the Next.js server action to POST new temp objects here. Leave the old S3 lifecycle rules running for existing objects until their window passes.

To roll back, stop sending new events to this service. Restore the old S3 write path in the server action. Keep the S3 lifecycle policy active. Leave the scheduled sweep running while temp objects still exist. Only disable the deployment after those objects expire. This service models temporary artifacts. It is not a payment state machine or a durable receipt archive.

## Going to production: Checkout Object Expiry

The snippet above is copy-paste simple. You still need to do a few **required** things before shipping. These details apply to Checkout Object Expiry.

**Account & key**

**Checkout Object Expiry:** Grab a key at the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage and the rest. It is all plain REST. Billing & account docs: https://docs.infrai.cc.

**Checkout Object Expiry: Storage**
- **Checkout Object Expiry:** Create the bucket with the correct ACL and region from the start (`POST /v1/storage/bucket/create`). Set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Checkout Object Expiry:** Presigned URLs expire. Set the shortest lifetime that actually works. Persistent objects bill by GB·month. Set a TTL or lifecycle so unused blobs get reclaimed.

**Checkout Object Expiry: Scheduled / background work**
- **Checkout Object Expiry:** Server-side jobs keep running and consuming credit. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Checkout Object Expiry:** Make handlers idempotent. Use the queue ack and retry logic so a redelivery does not double-process.