import { desc, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { snapshots } from "../db/schema";
import { PublicRequestError } from "./request";

const BLOCKING_SNAPSHOT_STATUSES = ["candidate", "failed"];
const VISIBLE_SNAPSHOT_STATUSES = ["active", ...BLOCKING_SNAPSHOT_STATUSES];

/**
 * Returns a persisted publication token while rejecting candidate or failed
 * snapshots. Call before and after a multi-query read to prevent a request from
 * observing data while a D1 sync batch is changing the public tables.
 */
export async function publicationFence(): Promise<string> {
  const rows = await getDb()
    .select({
      id: snapshots.id,
      status: snapshots.status,
      publishedAt: snapshots.publishedAt,
      createdAt: snapshots.createdAt,
    })
    .from(snapshots)
    .where(inArray(snapshots.status, VISIBLE_SNAPSHOT_STATUSES))
    .orderBy(desc(snapshots.createdAt))
    .limit(20);

  if (rows.some((row) => BLOCKING_SNAPSHOT_STATUSES.includes(row.status)))
    throw new PublicRequestError(
      "数据正在安全发布或等待恢复，请稍后再试",
      503,
    );

  const active = rows.find((row) => row.status === "active");
  return active ? `${active.id}:${active.publishedAt ?? "pending"}` : "legacy";
}

export async function assertPublicationFence(expected: string): Promise<void> {
  const current = await publicationFence();
  if (current !== expected)
    throw new PublicRequestError("数据版本刚刚更新，请重试", 503);
}
