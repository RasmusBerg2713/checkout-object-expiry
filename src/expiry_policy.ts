export type Stage = "checkout" | "fulfillment" | "receipt" | "update";

const hours: Record<Stage, number> = { checkout: 2, fulfillment: 48, receipt: 24, update: 6 };

export function objectKey(orderId: string, stage: Stage, createdAt: number): string {
  return `temporary/${stage}/${createdAt + hours[stage] * 3_600_000}/${orderId}.json`;
}

export function expired(key: string, now: number): boolean {
  const match = /^temporary\/(checkout|fulfillment|receipt|update)\/(\d+)\/[^/]+\.json$/.exec(key);
  return match !== null && Number(match[2]) <= now;
}
