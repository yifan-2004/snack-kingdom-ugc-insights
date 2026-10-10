import { cleanUgcContent, extractAspects, PIPELINE_VERSION } from "../topic-pipeline";

export const ENTERPRISE_PIPELINE = `enterprise-1/${PIPELINE_VERSION}`;
export const LIMITS = { posts: 1000, batches: 1000, batchPosts: 2, comments: 500, bytes: 8_000_000, snapshots: 10 };
export type Role = "owner" | "admin" | "analyst" | "viewer";
export type Principal = { userId: string; email: string; machineTenant?: string; machineTokenHash?: string };
export class EnterpriseError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function requireRole(role: Role, write = false, admin = false) {
  if ((admin && !["owner", "admin"].includes(role)) || (write && role === "viewer"))
    throw new EnterpriseError("没有执行此操作的权限", 403);
}
export function boundedText(value: unknown, name: string, max = 200, required = true): string {
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max)
    throw new EnterpriseError(`${name}格式不正确或过长`);
  return value.trim();
}
export function positiveInt(value: unknown, name: string, max: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max)
    throw new EnterpriseError(`${name}必须为1至${max}的整数`);
  return value;
}
export async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function secretToken() { return crypto.randomUUID() + crypto.randomUUID(); }

export function normalizeDocument(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EnterpriseError("帖子格式不正确");
  const p = value as Record<string, unknown>;
  const platform = boundedText(p.platform, "平台", 32);
  if (!["xhs", "douyin"].includes(platform)) throw new EnterpriseError("不支持的平台");
  const externalId = boundedText(p.post_id ?? p.id, "帖子ID", 160);
  const title = boundedText(p.title, "标题", 500);
  // A full snapshot must explicitly carry the complete intended comment set.
  // Missing is never interpreted as deletion. Empty arrays are explicit.
  if (!Array.isArray(p.comments) || p.comments.length > LIMITS.comments)
    throw new EnterpriseError("每帖必须明确提供comments数组，最多500条；不支持用缺失字段清空评论");
  const body = boundedText(p.body_text ?? p.content ?? "", "正文", 20_000, false);
  const source = typeof p.source_url === "string" ? p.source_url : "";
  let sourceUrl = "";
  try { const u = new URL(source); if (["http:", "https:"].includes(u.protocol) && !u.username && !u.password) sourceUrl = u.href; } catch { /* Invalid source links are omitted, never executed. */ }
  const ids = new Set<string>();
  const comments = p.comments.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new EnterpriseError("评论格式不正确");
    const c = item as Record<string, unknown>;
    const id = boundedText(c.comment_id ?? c.id, "评论ID", 180);
    if (ids.has(id)) throw new EnterpriseError("同一帖子评论ID重复");
    ids.add(id);
    const raw = boundedText(c.content, "评论正文", 12_000);
    const cleaned = cleanUgcContent(raw);
    const aspects = extractAspects(cleaned);
    return { id, parentId: typeof c.parent_comment_id === "string" ? c.parent_comment_id.slice(0, 180) : null,
      raw, text: cleaned.normalizedText, valid: cleaned.isValid, flags: cleaned.flags,
      aspects, analysisMode: "rules" as const,
      needsReview: !aspects.length || aspects.some(a => a.confidence < 700 || !a.topicId),
      // Keep upstream labels as source evidence, never overwrite per-topic labels.
      sourceSentiment: ["positive", "neutral", "negative"].includes(String(c.sentiment)) ? String(c.sentiment) : null };
  });
  const publishedAt = typeof p.published_at === "string" && Number.isFinite(Date.parse(p.published_at)) ? new Date(p.published_at).toISOString() : null;
  return { entityKey: JSON.stringify([platform, externalId]), platform, externalId, title, body, sourceUrl, publishedAt,
    comments, rawComments: comments.length, validComments: comments.filter(c => c.valid).length,
    pipelineVersion: ENTERPRISE_PIPELINE };
}
export type EnterpriseDocument = ReturnType<typeof normalizeDocument>;

export function summarizeDocuments(docs: EnterpriseDocument[]) {
  const topics = new Map<string, { name: string; comments: number; posts: Set<string>; positive: number; neutral: number; negative: number }>();
  let raw = 0, valid = 0, review = 0;
  for (const post of docs) for (const c of post.comments) {
    raw++; if (c.valid) valid++; if (c.needsReview) review++;
    for (const a of c.aspects) {
      const key = a.topicId ?? `candidate:${a.normalizedText}`;
      const row = topics.get(key) ?? { name: a.normalizedText, comments: 0, posts: new Set<string>(), positive: 0, neutral: 0, negative: 0 };
      row.comments++; row.posts.add(post.entityKey); row[a.sentiment]++; topics.set(key, row);
    }
  }
  return { posts: docs.length, rawComments: raw, validComments: valid, excludedComments: raw - valid, needsReview: review,
    topics: [...topics.entries()].map(([id, t]) => ({ ...t, id, posts: t.posts.size })).sort((a,b) => b.comments-a.comments),
    limitations: ["当前为规则分析，未接大模型；需要人工复核否定、反讽与上下文依赖表达。", "多主题评论可计入多个Topic；主题提及数不能相加当总评论数。", "仅描述导入样本，不代表全体消费者或全平台覆盖。"] };
}

export function evidenceForQuestion(docs: EnterpriseDocument[], question: string) {
  const q = question.normalize("NFKC").toLowerCase();
  const words = q.match(/[a-z0-9_]{2,}|[\p{Script=Han}]{2,}/gu) ?? [];
  const terms = [...new Set(words.flatMap(w => /\p{Script=Han}/u.test(w) ? Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2)) : [w]))];
  return docs.flatMap(p => p.comments.filter(c=>c.valid).map(c => ({ postId:p.externalId, platform:p.platform, commentId:c.id, title:p.title,
    sourceUrl:p.sourceUrl, excerpt:c.raw.slice(0,600), score:terms.filter(t=>`${p.title} ${c.text}`.toLowerCase().includes(t)).length })))
    .filter(e=>e.score > 0).sort((a,b)=>b.score-a.score).slice(0,8);
}
