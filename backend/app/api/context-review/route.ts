import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { commentReviewDecisions } from "../../../db/schema";
import { mirrorResponse, readMirror } from "../../../lib/local-mirror";
import { requireOwner } from "../../../lib/site-owner";
import { enforceRateLimit, PublicRequestError } from "../../../lib/request";

type ReviewCase = {
  post_id: string; post_title: string; comment_id: string; packet_hash: string;
  raw_text: string; context: { post_text: string; parent_text: string };
  attributes: Record<string, unknown> | null; review_reasons: string[];
};
type Queue = { items: ReviewCase[]; posts: number; comments: number; legacy_posts: number };

async function pending() {
  // The bundled queue makes the first release immediately usable. Subsequent
  // local synchronizations replace it with the R2 mirror without a rebuild.
  const queue = await readMirror<Queue>("review-queue.json");
  if (!Array.isArray(queue.items)) throw new Error("审核数据格式错误");
  const decisions = await getDb().select().from(commentReviewDecisions);
  const approved = new Set(decisions.map(row => `${row.postId}\0${row.commentId}\0${row.packetHash}`));
  return { queue, items: queue.items.filter(row => !approved.has(`${row.post_id}\0${row.comment_id}\0${row.packet_hash}`)) };
}

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "review-read", 60);
    const { queue, items } = await pending();
    const params = new URL(request.url).searchParams;
    const offset = Math.max(0, Math.min(10000, Number(params.get("offset")) || 0));
    const limit = Math.max(1, Math.min(100, Number(params.get("limit")) || 25));
    const q = (params.get("q") ?? "").trim().toLocaleLowerCase().slice(0, 200);
    const filtered = q ? items.filter(row => `${row.raw_text} ${row.post_title}`.toLocaleLowerCase().includes(q)) : items;
    return Response.json({ items: filtered.slice(offset, offset + limit), total: filtered.length, posts: queue.posts, comments: queue.comments, legacy_posts: queue.legacy_posts ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PublicRequestError) return Response.json({ detail: error.message }, { status: error.status });
    return mirrorResponse(error);
  }
}

export async function POST(request: Request) {
  const actor = await requireOwner(request);
  if (actor instanceof Response) return actor;
  try {
    const body = await request.json() as Record<string, unknown>;
    const postId = String(body.post_id ?? "");
    const commentId = String(body.comment_id ?? "");
    const hash = String(body.expected_packet_hash ?? "");
    const attrs = body.attributes as Record<string, unknown> | null;
    const note = String(body.note ?? "").trim();
    if (!postId || !commentId || !hash || postId.length > 250 || commentId.length > 250 || hash.length > 150 || note.length > 1000 || !attrs)
      return Response.json({ detail: "审核请求不完整" }, { status: 400 });
    const { queue } = await pending();
    const row = queue.items.find(item => item.post_id === postId && item.comment_id === commentId);
    if (!row || row.packet_hash !== hash) return Response.json({ detail: "源数据已更新，请刷新后重新审核" }, { status: 409 });
    const target = attrs.target;
    if (!(["brand", "blogger", "other"] as unknown[]).includes(target))
      return Response.json({ detail: "请确定评论针对的对象" }, { status: 400 });
    const relevance = target === "brand" ? "related" : "unrelated";
    const sentiment = target === "brand" ? attrs.sentiment : null;
    if (target === "brand" && !["positive", "neutral", "negative", "mixed"].includes(String(sentiment)))
      return Response.json({ detail: "请确定针对品牌的情感" }, { status: 400 });
    const evidence = attrs.evidence;
    if (!Array.isArray(evidence) || !evidence.length || evidence.length > 10 || evidence.some(item => typeof item !== "string" || !item.trim() || !row.raw_text.includes(item) || item.length > 500))
      return Response.json({ detail: "证据必须逐字来自原始评论" }, { status: 400 });
    const description = String(attrs.description ?? "").trim();
    if (!description || description.length > 250) return Response.json({ detail: "请填写简短的评论描述" }, { status: 400 });
    const normalized = { ...attrs, target, relevance, sentiment, description, evidence, ambiguity: [], review_status: "human_confirmed" };
    const db = getDb();
    const old = await db.select().from(commentReviewDecisions).where(and(eq(commentReviewDecisions.postId, postId), eq(commentReviewDecisions.commentId, commentId))).get();
    if (old && old.packetHash === hash) return Response.json({ detail: "这条评论已审核，请刷新列表" }, { status: 409 });
    await db.insert(commentReviewDecisions).values({ postId, commentId, packetHash: hash, attributesJson: JSON.stringify(normalized), note, reviewerId: actor, reviewedAt: new Date().toISOString() }).onConflictDoUpdate({ target: [commentReviewDecisions.postId, commentReviewDecisions.commentId], set: { packetHash: hash, attributesJson: JSON.stringify(normalized), note, reviewerId: actor, reviewedAt: new Date().toISOString() } });
    return Response.json({ ok: true, review_status: "human_confirmed", derived_refresh_required: true });
  } catch (error) { console.error("review save failed", error); return Response.json({ detail: "审核保存失败" }, { status: 500 }); }
}
