import { createServer } from "node:http";
import { z } from "zod";
import { infrai, InfraiError } from "./infrai.ts";
import { expired, objectKey } from "./expiry_policy.ts";
import { bucket, ensureBucket } from "./setup_expiry.ts";

const order = z.object({
  orderId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  stage: z.enum(["checkout", "fulfillment", "receipt", "update"]),
  details: z.record(z.unknown()),
  createdAt: z.number().int().nonnegative(),
});

const ready = ensureBucket();
const port = Number(process.env.PORT ?? 3000);
createServer(async (req, res) => {
  const reply = (status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  try {
    await ready;
    if (req.method === "POST" && req.url === "/orders") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const input = order.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const key = objectKey(input.orderId, input.stage, input.createdAt);
      await infrai.storage.object.put(bucket, key, Buffer.from(JSON.stringify(input)).toString("base64"));
      reply(201, { orderId: input.orderId, stage: input.stage, key, expiresAt: Number(key.split("/")[2]) });
    } else if (req.method === "POST" && req.url === "/sweep") {
      const { items } = await infrai.storage.object.list(bucket);
      const due = items.filter(item => expired(item.key, Date.now()));
      for (const item of due) await infrai.storage.object.delete(bucket, item.key);
      reply(200, { deleted: due.map(item => item.key) });
    } else reply(404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) reply(400, { error: "Invalid order body" });
    else if (error instanceof InfraiError) reply(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, message: error.message });
    else reply(502, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
}).listen(port, () => console.log(`Order service listening on ${port}`));
