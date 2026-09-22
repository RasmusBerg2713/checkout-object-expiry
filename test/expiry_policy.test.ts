import assert from "node:assert/strict";
import { test } from "node:test";
import { expired, objectKey } from "../src/expiry_policy.ts";

test("checkout expires before fulfillment, while unrelated keys stay untouched", () => {
  const start = Date.UTC(2026, 0, 1);
  const checkout = objectKey("order-42", "checkout", start);
  const fulfillment = objectKey("order-42", "fulfillment", start);
  assert.equal(expired(checkout, start + 3 * 3_600_000), true);
  assert.equal(expired(fulfillment, start + 3 * 3_600_000), false);
  assert.equal(expired("receipts/permanent.json", start + 100 * 3_600_000), false);
});
