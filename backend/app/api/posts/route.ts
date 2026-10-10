import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { comments, posts } from "../../../db/schema";
import { enforceRateLimit, errorResponse } from "../../../lib/request";
import {
  assertPublicationFence,
  publicationFence,
} from "../../../lib/publication-fence";
import { parseJson, safeHttpUrl } from "../../../lib/safe";

const cacheHeaders = {
  "Cache-Control": "public, max-age=20, stale-while-revalidate=40",
};

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "posts", 60);
    const fence = await publicationFence();
    const db = getDb();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (Number.isSafeInteger(id) && id > 0) {
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);
      if (!post) return Response.json({ error: "帖子不存在" }, { status: 404 });
      const postComments = await db
        .select()
        .from(comments)
        .where(
          and(eq(comments.postId, id), eq(comments.isCurrent, true)),
        );
      await assertPublicationFence(fence);
      return Response.json(
        {
          post: {
            ...post,
            sourceUrl: safeHttpUrl(post.sourceUrl),
            sentiment: normalizeSentiment(post.sentiment),
            media: parseJson<Array<{ url?: string; description?: string }>>(
              post.mediaJson,
              [],
            )
              .map((media) => ({
                url: safeHttpUrl(media.url),
                description: String(media.description ?? "").slice(0, 1200),
              }))
              .filter((media): media is { url: string; description: string } =>
                Boolean(media.url),
              ),
            comments: postComments.map((comment) => ({
              ...comment,
              sentiment: normalizeSentiment(comment.sentiment),
            })),
          },
        },
        { headers: cacheHeaders },
      );
    }

    const rows = await db
      .select({
        id: posts.id,
        platform: posts.platform,
        title: posts.title,
        summary: posts.summary,
        sentiment: posts.sentiment,
        publishedAt: posts.publishedAt,
      })
      .from(posts)
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(500);
    if (!rows.length) {
      await assertPublicationFence(fence);
      return Response.json({ posts: [] }, { headers: cacheHeaders });
    }
    const ids = rows.map((row) => row.id);
    const totals = (
      await Promise.all(
        // D1 allows at most 100 bound parameters per statement. Keep room for
        // the additional isCurrent predicate and future filters.
        chunk(ids, 90).map((group) =>
          db
            .select({
              postId: comments.postId,
              commentCount: sql<number>`coalesce(sum(${comments.representedCount}), 0)`,
            })
            .from(comments)
            .where(
              and(
                inArray(comments.postId, group),
                eq(comments.isCurrent, true),
              ),
            )
            .groupBy(comments.postId),
        ),
      )
    ).flat();
    const countByPost = new Map(
      totals.map((total) => [total.postId, Number(total.commentCount) || 0]),
    );
    await assertPublicationFence(fence);
    return Response.json(
      {
        limit: 500,
        truncated: rows.length >= 500,
        posts: rows.map((row) => ({
          ...row,
          platform: normalizePlatform(row.platform),
          sentiment: normalizeSentiment(row.sentiment),
          commentCount: countByPost.get(row.id) ?? 0,
        })),
      },
      { headers: cacheHeaders },
    );
  } catch (error) {
    return errorResponse(error, "数据读取暂不可用，请稍后重试");
  }
}

function normalizeSentiment(value: string) {
  return value === "positive" || value === "negative" ? value : "neutral";
}
function normalizePlatform(value: string) {
  return value === "xhs" || value === "douyin" ? value : "unknown";
}
function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}
