import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { datasetArchives, snapshots } from "../../../../db/schema";
import { readBoundedText } from "../../../../lib/request";

const MAX_ARCHIVE_BYTES = 3_000_000;
const SNAPSHOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

class ArchiveRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function requireSyncAuthorization(request: Request) {
  const runtime = env as unknown as {
    SYNC_ENABLED?: string;
    SYNC_TOKEN_V2?: string;
  };
  if (runtime.SYNC_ENABLED !== "true")
    throw new ArchiveRequestError("站点同步未启用，请由管理员完成配置", 409);
  const supplied =
    request.headers.get("x-sync-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!runtime.SYNC_TOKEN_V2)
    throw new ArchiveRequestError("网站同步尚未配置令牌", 503);
  if (supplied !== runtime.SYNC_TOKEN_V2)
    throw new ArchiveRequestError("同步令牌无效", 401);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  try {
    // Authorize before accepting a potentially large JSON snapshot.
    requireSyncAuthorization(request);
    const snapshotId = request.headers.get("x-sync-snapshot-id")?.trim() ?? "";
    if (!SNAPSHOT_ID.test(snapshotId))
      throw new ArchiveRequestError("快照标识不正确");

    const raw = await readBoundedText(request, MAX_ARCHIVE_BYTES);
    let payload: unknown;
    try { payload = JSON.parse(raw); }
    catch { throw new ArchiveRequestError("归档不是有效的 JSON"); }
    if (!payload || Array.isArray(payload) || typeof payload !== "object")
      throw new ArchiveRequestError("归档结构不正确");
    const record = payload as { post_count?: unknown; posts?: unknown };
    if (!Array.isArray(record.posts) || !Number.isInteger(record.post_count))
      throw new ArchiveRequestError("归档缺少帖子清单");
    if (record.post_count !== record.posts.length || record.posts.length > 500)
      throw new ArchiveRequestError("归档帖子数量不正确");

    const db = getDb();
    const snapshot = await db
      .select({ id: snapshots.id, status: snapshots.status })
      .from(snapshots)
      .where(eq(snapshots.id, snapshotId))
      .get();
    if (!snapshot || snapshot.status !== "active")
      throw new ArchiveRequestError("只能归档已发布的数据快照", 409);

    const bucket = (env as unknown as { DATASETS?: R2Bucket }).DATASETS;
    if (!bucket)
      throw new ArchiveRequestError("站点归档存储尚未配置", 503);
    const checksum = await sha256(raw);
    const objectKey = `processed-snapshots/${snapshotId}.json`;
    await bucket.put(objectKey, raw, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { snapshotId, sha256: checksum },
    });
    await db
      .insert(datasetArchives)
      .values({
        snapshotId,
        objectKey,
        sha256: checksum,
        byteCount: new TextEncoder().encode(raw).byteLength,
        postCount: record.posts.length,
      })
      .onConflictDoUpdate({
        target: datasetArchives.snapshotId,
        set: {
          objectKey,
          sha256: checksum,
          byteCount: new TextEncoder().encode(raw).byteLength,
          postCount: record.posts.length,
          uploadedAt: new Date().toISOString(),
        },
      });
    return Response.json({
      ok: true,
      snapshotId,
      postCount: record.posts.length,
      sha256: checksum,
    });
  } catch (error) {
    if (error instanceof ArchiveRequestError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("sync archive failed", error);
    return Response.json({ error: "归档上传失败，请稍后重试" }, { status: 500 });
  }
}
