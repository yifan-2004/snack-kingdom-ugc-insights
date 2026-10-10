import { env } from "cloudflare:workers";
import { writeMirror } from "../../../../lib/local-mirror";
import { readBoundedText } from "../../../../lib/request";

const MAX_BYTES = 4_000_000;
const KEY = /^(overview|needs|posts|time-tree|explorer|review-queue|rag-corpus|post-details\/[A-Za-z0-9._~-]+|post-packets\/[A-Za-z0-9._~-]+)\.json$/;

function authorize(request: Request) {
  const runtime = env as unknown as { SYNC_ENABLED?: string; SYNC_TOKEN_V2?: string };
  const supplied = request.headers.get("x-sync-token") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (runtime.SYNC_ENABLED !== "true" || !runtime.SYNC_TOKEN_V2) return false;
  return supplied === runtime.SYNC_TOKEN_V2;
}

export async function POST(request: Request) {
  try {
    if (!authorize(request)) return Response.json({ detail: "同步令牌无效" }, { status: 401 });
    const key = request.headers.get("x-mirror-key")?.trim() ?? "";
    if (!KEY.test(key)) return Response.json({ detail: "镜像键不正确" }, { status: 400 });
    const raw = await readBoundedText(request, MAX_BYTES);
    JSON.parse(raw);
    await writeMirror(key, raw);
    return Response.json({ ok: true, key, bytes: new TextEncoder().encode(raw).byteLength });
  } catch (error) {
    console.error("mirror upload failed", error);
    return Response.json({ detail: "镜像上传失败" }, { status: 400 });
  }
}
