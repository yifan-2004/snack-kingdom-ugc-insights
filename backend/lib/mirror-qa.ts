import { readMirror } from "./local-mirror";

type Doc = { id: string; post_id: string; title: string; platform: string; source_url: string; kind: "post" | "comment"; text: string; description?: string; target?: string; topic_ids: string[]; sentiment: string };
type Corpus = { schema_version: number; source?: { sample_size?: number; comment_count?: number; completed_at?: string }; documents: Doc[] };
type Topic = { name?: string; name_en?: string; post_count?: number; comment_count?: number; represented_mentions?: number; sentiment_ratio?: Record<string, number> };
type Overview = { sample_size: number; comment_count: number; platform_count?: Record<string, number>; summary?: string; strengths?: string[]; problems?: string[]; actions?: string[]; topics?: Topic[]; completed_at?: string };

let cached: Promise<{ overview: Overview; corpus: Corpus }> | null = null;
let cachedUntil = 0;
async function data() {
  if (!cached || Date.now() > cachedUntil) {
    cachedUntil = Date.now() + 30_000;
    cached = Promise.all([readMirror<Overview>("overview.json"), readMirror<Corpus>("rag-corpus.json")])
      .then(([overview, corpus]) => {
        if (corpus.source?.sample_size !== overview.sample_size || corpus.source?.comment_count !== overview.comment_count || corpus.source?.completed_at !== overview.completed_at) throw new Error("Partial mirror update");
        return { overview, corpus };
      });
  }
  return cached;
}

export async function mirrorSignature() {
  const { overview, corpus } = await data();
  return `${overview.completed_at ?? "unknown"}:${overview.sample_size}:${overview.comment_count}:${corpus.documents.length}`;
}

function tokens(value: string) {
  const lower = value.toLocaleLowerCase().replace(/有什么|有哪些|是什么|怎么样|是否|如何|多少|当前|用户|顾客|消费者|品牌|零食王国|评论|帖子|负面|正面|差评|投诉|反馈|评价|主要|具体|请问|请给出|请列出|问题|证据/g, " ");
  const words = lower.match(/[a-z0-9]+|[\p{Script=Han}]+/gu) ?? [];
  const result = new Set<string>();
  for (const word of words) {
    if (/^[\p{Script=Han}]+$/u.test(word)) {
      for (let i = 0; i < word.length - 1; i++) result.add(word.slice(i, i + 2));
    } else if (word.length > 1) result.add(word);
  }
  return [...result].filter(t => !["what", "which", "where", "when", "why", "how", "many", "much", "the", "are", "is", "was", "were", "and", "or", "about", "users", "customers", "consumer", "comments", "posts", "feedback", "negative", "positive", "main", "please", "show", "tell", "does", "have", "there", "from", "current", "sample"].includes(t));
}

function rank(question: string, docs: Doc[]) {
  const terms = tokens(question);
  const negative = /负面|差评|投诉|不满|问题|negative|complaint|critical/i.test(question);
  const positive = /正面|好评|喜欢|优势|推荐|positive|recommend|praise/i.test(question);
  const wantsComments = /评论|用户|顾客|消费者|comment|customer|consumer/i.test(question);
  const scored = docs.filter(d => (d.kind === "post" || d.target === "brand")
    && !(wantsComments && d.kind === "post")
    && !(negative && !positive && d.kind === "comment" && d.sentiment !== "negative")
    && !(positive && !negative && d.kind === "comment" && d.sentiment !== "positive")).map(d => {
    // Parent title is context, not proof that a particular comment discusses
    // the query topic. Matching it would recreate the false-positive problem.
    const text = (d.kind === "comment" ? d.text : `${d.title} ${d.text}`).toLocaleLowerCase();
    const match = terms.reduce((sum, term) => sum + (text.includes(term) ? term.length + 1 : 0), 0);
    const score = match ? match + (wantsComments && d.kind === "comment" ? 1 : 0)
      + (negative && d.sentiment === "negative" ? 2 : 0)
      + (positive && d.sentiment === "positive" ? 2 : 0) : 0;
    return { doc: d, score };
  }).filter(row => row.score > 0).sort((a,b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
  const perPost = new Map<string, number>();
  return scored.filter(row => { const count = perPost.get(row.doc.post_id) ?? 0; if (count >= 2) return false; perPost.set(row.doc.post_id, count + 1); return true }).slice(0, 8).map(row => row.doc);
}

export async function answerMirror(question: string, locale: "zh-CN" | "en" = "en") {
  const { overview, corpus } = await data();
  const q = question.trim().slice(0, 500);
  const docs = corpus.documents;
  const statistical = /多少.*帖|多少.*评论|帖子.*评论.*多少|当前.*范围.*多少|how many.*(posts|comments)/i.test(q);
  const unsafe = /忽略此前|泄露.*提示词|编一个|虚构.*链接|销量增长.*证明|库存周转率.*提高/.test(q);
  const evidence = (statistical || unsafe ? [] : rank(q, docs)).map((d, i) => ({ chunkId: d.id, postId: d.post_id, title: d.title, sourceUrl: d.source_url, excerpt: d.text, sourceType: d.kind, sentiment: d.sentiment, citation: i + 1 }));
  let answer: string;
  if (unsafe) {
    answer = locale === "en" ? "The current posts and comments do not support this claim. I cannot invent numbers, sources, or system content." : "当前帖子与评论不包含足以证明该结论的数据。我不能编造数字、来源或系统内容。";
  } else if (statistical) {
    answer = locale === "en" ? `The current mirrored sample contains ${overview.sample_size} posts and ${overview.comment_count} raw comments: ${overview.platform_count?.xhs ?? 0} Xiaohongshu posts and ${overview.platform_count?.douyin ?? 0} Douyin posts. This sample does not represent all consumers.` : `当前已同步范围有 ${overview.sample_size} 篇帖子、${overview.comment_count} 条原始评论。小红书 ${overview.platform_count?.xhs ?? 0} 篇，抖音 ${overview.platform_count?.douyin ?? 0} 篇。此处是已采集样本，不代表全网消费者。`;
  } else if (/总结|总体|概况|主要话题|讨论什么|summary|overview|main topics|discussing most/i.test(q)) {
    const topics = (overview.topics ?? []).slice(0, 5).map(t => locale === "en" ? t.name_en : t.name).filter(Boolean).join(locale === "en" ? ", " : "、");
    answer = locale === "en" ? `The main discussion themes in the current sample are ${topics || "not available"}. The sample contains ${overview.sample_size} posts and ${overview.comment_count} raw comments. Review original sources before drawing business conclusions.` : `${overview.summary ?? ""}\n\n当前讨论主题包括：${topics || "暂无"}。结论仅覆盖已同步的 ${overview.sample_size} 篇帖子与 ${overview.comment_count} 条原始评论；具体判断仍应查看原帖证据。`;
  } else if (!evidence.length) {
    answer = locale === "en" ? "I could not find direct evidence in the synced posts and comments. Try a more specific product, theme, or time period." : "当前已同步的帖子与评论中没有检索到足以回答此问题的直接证据。请缩小到具体产品、话题或时间范围。";
  } else {
    const points = evidence.slice(0, 4).map((e, i) => locale === "en" ? `${i + 1}. ${e.sourceType === "comment" ? "Comment" : "Post"}: “${e.excerpt.slice(0, 180)}” [${i + 1}]` : `${i + 1}. ${e.sourceType === "comment" ? "评论" : "帖子"}：「${e.excerpt.slice(0, 180)}」[${i + 1}]`);
    answer = locale === "en" ? `Relevant source excerpts from the current sample:\n${points.join("\n")}\n\nThese excerpts are not sufficient to generalize to all consumers.` : `在当前已同步样本中，检索到以下相关内容：\n${points.join("\n")}\n\n这些是来源摘录，不能单凭少量样本断言所有消费者都这样认为。`;
  }
  return { answer, evidence, sources: evidence.map(e => ({ id: e.postId, title: e.title, sourceUrl: e.sourceUrl, excerpt: e.excerpt })), retrievedChunks: evidence.length, engine: "mirror-lexical-grounded-v1", retrievalMode: "lexical-source-linked", generator: "deterministic-grounded-no-llm", modelUsed: false, vectorStoreUsed: false, dataScope: { posts: overview.sample_size, comments: overview.comment_count, corpusDocuments: docs.length } };
}

export async function reportMirror(locale: "zh-CN" | "en" = "en") {
  const { overview } = await data();
  if (locale === "en") {
    const topics = (overview.topics ?? []).slice(0, 8).map((t,i) => `${i+1}. ${t.name_en || "Untranslated topic"}: ${t.represented_mentions ?? (t.post_count ?? 0) + (t.comment_count ?? 0)} mentions`).join("\n");
    return `Snack Kingdom UGC Insights Report\n\nScope: ${overview.sample_size} posts and ${overview.comment_count} raw comments. Snapshot: ${overview.completed_at ?? "current website mirror"}.\n\nMain discussion themes\n${topics || "No theme data available."}\n\nHow to use this report\nPrioritize the most discussed themes, then inspect the linked original posts and comments. Topic volume measures attention, not satisfaction or business impact. Compare positive and negative evidence within each theme before deciding what to change.\n\nLimitations\nThis report is based on a collected sample, not all consumers. It does not establish sales impact or causation. New review decisions will affect the report only after the local processing pipeline and mirror are refreshed.`;
  }
  const topicLines = (overview.topics ?? []).slice(0, 8).map((t, i) => `${i + 1}. ${t.name ?? "未命名主题"}：${t.represented_mentions ?? (t.post_count ?? 0) + (t.comment_count ?? 0)} 次提及`).join("\n");
  return `零食王国 UGC 洞察报告\n\n数据范围：${overview.sample_size} 篇帖子、${overview.comment_count} 条原始评论；更新：${overview.completed_at ?? "以网站镜像为准"}。\n\n总体观察\n${overview.summary ?? "当前没有可用的概述。"}\n\n主要讨论主题\n${topicLines || "暂无主题数据"}\n\n有利反馈\n${(overview.strengths ?? []).map((v,i)=>`${i+1}. ${v}`).join("\n") || "暂无"}\n\n待核查的问题\n${(overview.problems ?? []).map((v,i)=>`${i+1}. ${v}`).join("\n") || "暂无"}\n\n可考虑的行动\n${(overview.actions ?? []).map((v,i)=>`${i+1}. ${v}`).join("\n") || "暂无"}\n\n方法边界：以上归纳复用本地 App 已处理的资料，不能推断全体消费者、销量变化或因果关系。人工审核的新决定需回到处理链路重算后，才能改变主题榜单与报告。`;
}
