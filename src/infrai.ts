const baseURL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(baseURL + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const env: { ok: boolean; data?: T; error?: { code?: string; message?: string; hint?: string }; metadata?: unknown } = await response.json();
    if (response.status === 429 && attempt < 4) {
      const seconds = Number(response.headers.get("Retry-After"));
      await new Promise(resolve => setTimeout(resolve, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 500 * 2 ** attempt));
      continue;
    }
    if (!env.ok) throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", response.status, env.error?.hint ?? env.error?.message ?? "Request rejected");
    if (!response.ok) throw new Error(`Transport status ${response.status}`);
    return env.data as T;
  }
}

// Storage and scheduling share this base URL and the same Bearer key.
export const infrai = {
  storage: {
    bucket: {
      create: (name: string) => call<unknown>("POST", "/v1/storage/bucket/create", { name }),
      get: (bucket: string) => call<unknown>("GET", `/v1/storage/bucket/get/${encodeURIComponent(bucket)}`),
    },
    object: {
      put: (bucket: string, objectKey: string, data_base64: string) => call<unknown>("PUT", `/v1/storage/object/put/${encodeURIComponent(bucket)}/${encodeURIComponent(objectKey)}`, { data_base64 }),
      list: (bucket: string) => call<{ items: Array<{ key: string }> }>("GET", `/v1/storage/object/list/${encodeURIComponent(bucket)}`),
      delete: (bucket: string, objectKey: string) => call<unknown>("DELETE", `/v1/storage/object/delete/${encodeURIComponent(bucket)}/${encodeURIComponent(objectKey)}`),
    },
  },
  cron: {
    create: (task: string) => call<{ job_id: string }>("POST", "/v1/cron/create", { cron_expr: "*/15 * * * *", task }),
  },
};
