import { infrai, InfraiError } from "./infrai.ts";

export const bucket = process.env.INFRAI_BUCKET ?? "commerce-throwaway";

export async function ensureBucket(): Promise<void> {
  try {
    await infrai.storage.bucket.get(bucket);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    await infrai.storage.bucket.create(bucket);
  }
}

if (process.argv[1]?.endsWith("setup_expiry.ts")) {
  await ensureBucket();
  const task = process.env.PUBLIC_SWEEP_URL;
  if (!task) throw new Error("Set PUBLIC_SWEEP_URL to the public /sweep URL");
  const { job_id } = await infrai.cron.create(task);
  console.log(JSON.stringify({ bucket, job_id }));
}
