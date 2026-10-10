import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import {
  aspects,
  comments,
  contentVersions,
  engagementObservations,
  posts,
  processingRuns,
  snapshots,
  syncLogs,
  topicCandidates,
} from "../../../../db/schema";
import {
  enforceRateLimit,
  errorResponse,
  readJsonObject,
} from "../../../../lib/request";
import { invalidateSnapshotCache } from "../../../../lib/snapshot-cache";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "sync-reset", 5, 15 * 60_000);
    const configuredToken = (env as unknown as { RESET_TOKEN_V2?: string })
      .RESET_TOKEN_V2;
    const suppliedToken =
      request.headers.get("x-reset-token") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!configuredToken)
      return Response.json(
        { error: "清空功能未配置独立令牌" },
        { status: 503 },
      );
    if (suppliedToken !== configuredToken)
      return Response.json({ error: "清空令牌无效" }, { status: 401 });

    // Authenticate before reading even a bounded request body so anonymous
    // callers cannot spend JSON parsing work on this destructive endpoint.
    const body = await readJsonObject<{ confirm?: unknown }>(request, 16_384);
    if (body.confirm !== "RESET_SYNC_DATA")
      return Response.json({ error: "缺少清空确认" }, { status: 400 });
    const db = getDb();
    // D1 rejects the BEGIN emitted by Drizzle's transaction() helper. Native
    // batch is D1's atomic primitive and rolls back every delete on failure.
    await db.batch([
      db.delete(aspects),
      db.delete(comments),
      db.delete(posts),
      db.delete(topicCandidates),
      db.delete(contentVersions),
      db.delete(engagementObservations),
      db.delete(processingRuns),
      db.delete(snapshots),
      db.delete(syncLogs),
      // Preset and approved topics are governance data, not synchronized UGC;
      // retain them so a reset cannot erase the managed taxonomy.
      db.insert(syncLogs).values({ postCount: 0 }),
    ]);
    invalidateSnapshotCache();
    return Response.json(
      { ok: true, reset: true, topicsPreserved: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "清空失败，请稍后重试");
  }
}
