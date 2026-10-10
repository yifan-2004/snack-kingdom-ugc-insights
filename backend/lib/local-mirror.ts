import { env } from "cloudflare:workers";
import { readDemoMirror } from "./demo-data";

export class MirrorError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

function bucket() {
  const value = (env as unknown as { DATASETS?: R2Bucket }).DATASETS;
  if (!value) throw new MirrorError("网站数据镜像尚未配置", 503);
  return value;
}

export async function readMirror<T>(key: string): Promise<T> {
  if ((env as unknown as { DEMO_DATA?: string }).DEMO_DATA === "true") {
    const value = readDemoMirror(key);
    if (value === undefined) throw new MirrorError("Sample record not found", 404);
    return structuredClone(value) as T;
  }
  const object = await bucket().get(`local-app-mirror/${key}`);
  if (!object) throw new MirrorError("本地 App 数据尚未同步", 503);
  return object.json<T>();
}

export async function writeMirror(key: string, raw: string) {
  await bucket().put(`local-app-mirror/${key}`, raw, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { source: "snack-kingdom-local-app" },
  });
}

export function mirrorResponse(error: unknown) {
  if (error instanceof MirrorError)
    return Response.json({ detail: error.message }, { status: error.status });
  console.error("local app mirror failed", error);
  return Response.json({ detail: "读取本地 App 数据镜像失败" }, { status: 500 });
}

export const mirrorCache = {
  "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
};
