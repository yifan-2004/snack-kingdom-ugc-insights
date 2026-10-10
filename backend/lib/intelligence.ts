import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  aspects,
  comments,
  posts,
  topics as topicDefinitions,
} from "../db/schema";
import { cachedSnapshot } from "./snapshot-cache";
import {
  assertPublicationFence,
  publicationFence,
} from "./publication-fence";
import { parseJson, safeHttpUrl } from "./safe";
import {
  isOpinionBearing,
  normalizeOpinionKind,
  type OpinionKind,
} from "./opinion";

type Sentiment = "positive" | "neutral" | "negative";
type StoredPost = typeof posts.$inferSelect;
type StoredComment = typeof comments.$inferSelect;
type SnapshotAspect = {
  topicId: string | null;
  topicName: string;
  sentiment: Sentiment;
  evidenceText: string;
  confidence: number;
};
type SnapshotComment = StoredComment & {
  aspects: SnapshotAspect[];
  opinionKind: OpinionKind;
};

type PostMetadata = {
  sentimentRatio: Record<Sentiment, number>;
  validCommentCount: number;
  rawCommentCount: number;
  semanticClusterCount: number;
  contentTypes: string[];
  contentTopics: string[];
  topics: Array<{ name: string; role: string; sentiment: string }>;
  isCommercial: boolean;
  isOfficialOrMedia: boolean;
  evidenceStatus: string;
  mediaTotal: number;
  mediaAnalyzed: number;
};

export type SnapshotPost = Omit<StoredPost, "sourceUrl"> & {
  sourceUrl?: string;
  media: Array<{ url: string; description?: string }>;
  metadata: PostMetadata;
  comments: SnapshotComment[];
};

export type Analysis = ReturnType<typeof analyzeSnapshot>;

const MAX_SELECTION = 200;
const indexCache = new WeakMap<SnapshotPost[], SearchDocument[]>();

/**
 * Loads a bounded analysis snapshot. A short-lived per-isolate cache avoids
 * rebuilding the exact same D1 snapshot for dashboard, report and Q&A calls.
 */
export async function loadSnapshot(
  selectedIds: number[] = [],
): Promise<SnapshotPost[]> {
  const fence = await publicationFence();
  const ids = [
    ...new Set(selectedIds.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ].slice(0, MAX_SELECTION);
  const cacheKey = ids.length
    ? `selection:${[...ids].sort((a, b) => a - b).join(",")}`
    : "all";
  const result = await cachedSnapshot(cacheKey, () => loadSnapshotUncached(ids));
  await assertPublicationFence(fence);
  return result;
}

async function loadSnapshotUncached(
  selectedIds: number[],
): Promise<SnapshotPost[]> {
  const db = getDb();
  let postRows: StoredPost[];
  if (selectedIds.length) {
    // Leave headroom below D1's 100-bound-parameter ceiling so these queries
    // remain safe when another predicate is added.
    const groups = chunk(selectedIds, 90);
    postRows = (
      await Promise.all(
        groups.map((group) =>
          db.select().from(posts).where(inArray(posts.id, group)),
        ),
      )
    ).flat();
    const order = new Map(selectedIds.map((id, index) => [id, index]));
    postRows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } else {
    postRows = await db
      .select()
      .from(posts)
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(500);
  }

  const ids = postRows.map((row) => row.id);
  const commentRows = ids.length
    ? (
        await Promise.all(
          chunk(ids, 90).map((group) =>
            db
              .select()
              .from(comments)
              .where(
                and(
                  inArray(comments.postId, group),
                  eq(comments.isCurrent, true),
                ),
              ),
          ),
        )
      ).flat()
    : [];
  const commentIds = commentRows.map((row) => row.id);
  const aspectRows = commentIds.length
    ? (
        await Promise.all(
          chunk(commentIds, 90).map((group) =>
            db
              .select({
                commentId: aspects.commentId,
                topicId: aspects.topicId,
                topicName: topicDefinitions.name,
                sentiment: aspects.sentiment,
                evidenceText: aspects.evidenceText,
                confidence: aspects.confidence,
              })
              .from(aspects)
              .leftJoin(
                topicDefinitions,
                eq(aspects.topicId, topicDefinitions.id),
              )
              .where(inArray(aspects.commentId, group)),
          ),
        )
      ).flat()
    : [];
  const aspectsByComment = new Map<number, SnapshotAspect[]>();
  for (const row of aspectRows) {
    const values = aspectsByComment.get(row.commentId) ?? [];
    values.push({
      topicId: row.topicId,
      topicName: cleanText(row.topicName, 100) || "待归类主题",
      sentiment: normalizeSentiment(row.sentiment),
      evidenceText: cleanText(row.evidenceText, 500),
      confidence: count(row.confidence),
    });
    aspectsByComment.set(row.commentId, values);
  }
  const commentsByPost = new Map<number, SnapshotComment[]>();
  for (const row of commentRows) {
    const values = commentsByPost.get(row.postId) ?? [];
    const cleaning = parseJson<Record<string, unknown>>(row.cleaningJson, {});
    values.push({
      ...row,
      aspects: aspectsByComment.get(row.id) ?? [],
      opinionKind: normalizeOpinionKind(cleaning.opinionKind),
    });
    commentsByPost.set(row.postId, values);
  }

  return postRows.map((row) => ({
    ...row,
    sourceUrl: safeHttpUrl(row.sourceUrl),
    media: parseJson<Array<{ url?: string; description?: string }>>(
      row.mediaJson,
      [],
    ).flatMap((media) => {
      const url = safeHttpUrl(media.url);
      return url
        ? [
            {
              url,
              description: cleanText(media.description, 1200) || undefined,
            },
          ]
        : [];
    }),
    metadata: parseMetadata(row.metadataJson),
    comments: commentsByPost.get(row.id) ?? [],
  }));
}

export function analyzeSnapshot(rows: SnapshotPost[]) {
  const platformCount = { xhs: 0, douyin: 0, unknown: 0 };
  const postSentiment = sentimentCounter();
  const weightedSentiment = sentimentCounter();
  const opinionWeightedSentiment = sentimentCounter();
  const opinionIntentCount: Record<OpinionKind, number> = {
    opinion: 0,
    mixed_opinion: 0,
    inquiry: 0,
    factual: 0,
    social: 0,
    off_topic: 0,
  };
  const types = new Map<string, number>();
  const topics = new Map<string, number>();
  const strengths = new Map<string, number>();
  const problems = new Map<string, number>();
  const questions = new Map<string, number>();
  const timeline = new Map<
    string,
    {
      posts: number;
      comments: number;
      positive: number;
      neutral: number;
      negative: number;
    }
  >();
  let rawComments = 0;
  let validComments = 0;
  let semanticClusters = 0;
  let representedComments = 0;
  let mediaTotal = 0;
  let mediaAnalyzed = 0;
  let titleCount = 0;
  let bodyCount = 0;
  let postsWithComments = 0;
  let sufficientEvidence = 0;
  let commercialPosts = 0;
  let officialPosts = 0;
  const dates: string[] = [];

  for (const row of rows) {
    const platform =
      row.platform === "douyin"
        ? "douyin"
        : row.platform === "xhs"
          ? "xhs"
          : "unknown";
    platformCount[platform] += 1;
    const sentiment = normalizeSentiment(row.sentiment);
    postSentiment[sentiment] += 1;
    titleCount += row.title && row.title !== "未命名帖子" ? 1 : 0;
    bodyCount += row.bodyText ? 1 : 0;
    postsWithComments += row.comments.length ? 1 : 0;
    const represented = row.comments.reduce(
      (sum, comment) => sum + representedCount(comment.representedCount),
      0,
    );
    representedComments += represented;
    let hasAspectEvidence = false;
    for (const comment of row.comments) {
      const weight = representedCount(comment.representedCount);
      const commentSentiment = normalizeSentiment(comment.sentiment);
      weightedSentiment[commentSentiment] += weight;
      opinionIntentCount[comment.opinionKind] += weight;
      if (isOpinionBearing(comment.opinionKind))
        opinionWeightedSentiment[commentSentiment] += weight;
      for (const aspect of comment.aspects) {
        hasAspectEvidence = true;
        const weight = representedCount(comment.representedCount);
        incrementBy(topics, aspect.topicName, weight);
        if (aspect.sentiment === "positive")
          incrementBy(strengths, aspect.topicName, weight);
        if (aspect.sentiment === "negative")
          incrementBy(problems, aspect.topicName, weight);
      }
    }
    rawComments += countOrFallback(row.metadata.rawCommentCount, represented);
    validComments += countOrFallback(
      row.metadata.validCommentCount,
      represented,
    );
    semanticClusters += countOrFallback(
      row.metadata.semanticClusterCount,
      row.comments.length,
    );
    mediaTotal += countOrFallback(row.metadata.mediaTotal, row.media.length);
    mediaAnalyzed += countOrFallback(
      row.metadata.mediaAnalyzed,
      row.media.filter((item) => item.description).length,
    );
    sufficientEvidence += row.metadata.evidenceStatus === "sufficient" ? 1 : 0;
    commercialPosts += row.metadata.isCommercial ? 1 : 0;
    officialPosts += row.metadata.isOfficialOrMedia ? 1 : 0;
    row.metadata.contentTypes.forEach((value) => increment(types, value));
    if (!hasAspectEvidence) {
      row.metadata.contentTopics.forEach((value) => increment(topics, value));
      for (const topic of row.metadata.topics) {
        if (topic.role === "user_strength") increment(strengths, topic.name);
        if (topic.role === "user_problem") increment(problems, topic.name);
        if (topic.role === "user_question") increment(questions, topic.name);
      }
    } else {
      for (const topic of row.metadata.topics)
        if (topic.role === "user_question") increment(questions, topic.name);
    }
    const day = cleanText(row.publishedAt, 32).slice(0, 10) || "未知日期";
    if (day !== "未知日期") dates.push(day);
    const bucket = timeline.get(day) ?? {
      posts: 0,
      comments: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    bucket.posts += 1;
    bucket.comments += represented;
    bucket[sentiment] += 1;
    timeline.set(day, bucket);
  }

  const weightedRatio = ratio(weightedSentiment);
  const opinionWeightedRatio = ratio(opinionWeightedSentiment);
  const postRatio = ratio(postSentiment);
  const polarized =
    opinionWeightedSentiment.positive + opinionWeightedSentiment.negative;
  const sortedDates = dates.sort();
  return {
    scope: {
      postCount: rows.length,
      platformCount,
      dateStart: sortedDates[0] ?? null,
      dateEnd: sortedDates.at(-1) ?? null,
      isTruncated: rows.length >= 500,
    },
    volume: {
      rawComments,
      validComments,
      semanticClusters,
      representedComments,
      mediaTotal,
      mediaAnalyzed,
    },
    sentiment: {
      postCount: postSentiment,
      postRatio,
      weightedCount: weightedSentiment,
      weightedRatio,
      opinionWeightedCount: opinionWeightedSentiment,
      opinionWeightedRatio,
      opinionWeight: Object.values(opinionWeightedSentiment).reduce(
        (sum, value) => sum + value,
        0,
      ),
      mixedOpinionWeight: opinionIntentCount.mixed_opinion,
      nonOpinionWeight:
        opinionIntentCount.inquiry +
        opinionIntentCount.factual +
        opinionIntentCount.social +
        opinionIntentCount.off_topic,
      intentCount: opinionIntentCount,
      netSentiment: round(
        opinionWeightedRatio.positive - opinionWeightedRatio.negative,
      ),
      polarization: polarized
        ? round(
            (2 *
              Math.min(
                opinionWeightedSentiment.positive,
                opinionWeightedSentiment.negative,
              )) /
              polarized,
          )
        : 0,
    },
    content: {
      contentTypes: ranking(types, rows.length),
      contentTopics: ranking(topics, Math.max(rows.length, representedComments)),
      strengths: ranking(
        strengths,
        Math.max(rows.length, representedComments),
      ),
      problems: ranking(problems, Math.max(rows.length, representedComments)),
      questions: ranking(questions, rows.length),
    },
    timeline: [...timeline.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, ...value })),
    dataQuality: {
      validCommentRate: safeRate(validComments, rawComments),
      mediaAnalysisRate: safeRate(mediaAnalyzed, mediaTotal),
      titleCoverage: safeRate(titleCount, rows.length),
      bodyCoverage: safeRate(bodyCount, rows.length),
      commentCoverage: safeRate(postsWithComments, rows.length),
      sufficientEvidenceRate: safeRate(sufficientEvidence, rows.length),
    },
    sampleFlags: {
      commercialPosts,
      officialOrMediaPosts: officialPosts,
      organicPosts: Math.max(0, rows.length - commercialPosts - officialPosts),
    },
  };
}

export function buildReport(rows: SnapshotPost[], analysis: Analysis) {
  const topStrengths = analysis.content.strengths
    .slice(0, 5)
    .map((item) => item.name);
  const topProblems = analysis.content.problems
    .slice(0, 5)
    .map((item) => item.name);
  const representative = [...rows]
    .sort(
      (a, b) =>
        b.comments.reduce(
          (sum, comment) => sum + representedCount(comment.representedCount),
          0,
        ) -
        a.comments.reduce(
          (sum, comment) => sum + representedCount(comment.representedCount),
          0,
        ),
    )
    .slice(0, 5);
  const sentimentSummary = summarizeSentiment(analysis);
  const truncationNote = analysis.scope.isTruncated
    ? "当前为最近 500 篇的上限快照，结论不包含更早数据。"
    : "当前结果覆盖所选范围内的全部帖子。";
  return `# 零食王国运营洞察报告\n\n## 执行摘要\n本次分析覆盖 ${analysis.scope.postCount} 篇帖子、${analysis.volume.rawComments} 条原始评论；在 ${analysis.sentiment.opinionWeight} 条意见型评论权重中，正面 ${percent(analysis.sentiment.opinionWeightedRatio.positive)}，负面 ${percent(analysis.sentiment.opinionWeightedRatio.negative)}，净情绪值 ${analysis.sentiment.netSentiment.toFixed(4)}。${sentimentSummary}\n\n## 样本与数据质量\n- 小红书 ${analysis.scope.platformCount.xhs} 篇，抖音 ${analysis.scope.platformCount.douyin} 篇，来源未知 ${analysis.scope.platformCount.unknown} 篇。\n- 有效评论 ${analysis.volume.validComments} 条，语义簇 ${analysis.volume.semanticClusters} 个，代表评论权重 ${analysis.volume.representedComments} 条。\n- 意见型评论权重 ${analysis.sentiment.opinionWeight} 条；询问、事实、社交或离题信号 ${analysis.sentiment.nonOpinionWeight} 条；褒贬混合 ${analysis.sentiment.mixedOpinionWeight} 条。\n- 评论有效率 ${percent(analysis.dataQuality.validCommentRate)}，媒体分析覆盖率 ${percent(analysis.dataQuality.mediaAnalysisRate)}，正文覆盖率 ${percent(analysis.dataQuality.bodyCoverage)}。\n- ${truncationNote}\n\n## 情绪与平台差异\n- 意见型口径：正面 ${percent(analysis.sentiment.opinionWeightedRatio.positive)}，真正中性评价 ${percent(analysis.sentiment.opinionWeightedRatio.neutral)}，负面 ${percent(analysis.sentiment.opinionWeightedRatio.negative)}。\n- 询问和事实信息不进入情感分母；褒贬混合评论保留为单独口径。\n- 两极分化指数 ${analysis.sentiment.polarization.toFixed(4)}；应结合具体评论证据判断，不以单个比例代替业务结论。\n\n## 内容主题与用户需求\n- 高频优势：${topStrengths.join("、") || "暂无集中主题"}。\n- 高频问题：${topProblems.join("、") || "暂无集中问题"}。\n- 高频内容：${
    analysis.content.contentTopics
      .slice(0, 6)
      .map((item) => item.name)
      .join("、") || "暂无集中主题"
  }。\n\n## 运营亮点\n${topStrengths.map((value, index) => `${index + 1}. ${value}`).join("\n") || "1. 当前样本未形成稳定的结构化优势主题。"}\n\n## 风险与问题\n${topProblems.map((value, index) => `${index + 1}. ${value}`).join("\n") || "1. 当前样本未形成集中负面主题，仍需持续监测。"}\n\n## 行动建议\n1. 对高频问题建立门店、时段和商品维度的核查清单。\n2. 将高频优势转化为选品、陈列和传播素材，同时保留原帖证据。\n3. 优先补齐媒体分析与评论缺失样本，避免数据缺口放大偏差。\n\n## 代表性用户反馈\n${representative.map((row) => `- ${row.title}：${row.summary || row.bodyText.slice(0, 100) || "暂无摘要"}`).join("\n")}\n\n## 结论边界\n本报告只代表当前采集样本，不能直接外推到全部消费者或所有门店，也不能据此证明因果关系。`;
}

export function answerQuestion(rows: SnapshotPost[], question: string) {
  const analysis = analyzeSnapshot(rows);
  const ranked = retrieve(rows, question, 6);
  return answerFromEvidence(analysis, ranked, question);
}

function answerFromEvidence(
  analysis: Analysis,
  ranked: SearchHit[],
  question: string,
) {
  const q = question.toLowerCase();
  let answer: string;
  if (/多少|样本|原始评论|有效评论|代表评论|语义簇/.test(q)) {
    answer = `当前范围包含 ${analysis.scope.postCount} 篇帖子、${analysis.volume.rawComments} 条原始评论、${analysis.volume.validComments} 条有效评论、${analysis.volume.semanticClusters} 个语义簇和 ${analysis.volume.representedComments} 条代表评论权重。这些口径不能混用：原始评论表示采集量，有效评论表示清洗后可用量，语义簇表示去重后的观点数量，代表评论权重用于还原相似评论规模。`;
  } else if (/情绪|正面|负面|中性|口碑|两极|净情绪/.test(q)) {
    answer = `意见型评论权重为 ${analysis.sentiment.opinionWeight} 条：正面 ${percent(analysis.sentiment.opinionWeightedRatio.positive)}、真正中性评价 ${percent(analysis.sentiment.opinionWeightedRatio.neutral)}、负面 ${percent(analysis.sentiment.opinionWeightedRatio.negative)}；另有 ${analysis.sentiment.nonOpinionWeight} 条询问、事实、社交或离题信号和 ${analysis.sentiment.mixedOpinionWeight} 条褒贬混合信号未塞入中性分母。净情绪值 ${analysis.sentiment.netSentiment.toFixed(4)}，两极分化指数 ${analysis.sentiment.polarization.toFixed(4)}。这是当前样本结论，不代表全部消费者。`;
  } else if (/质量|覆盖|缺失|可靠|证据/.test(q)) {
    answer = `当前评论有效率 ${percent(analysis.dataQuality.validCommentRate)}，媒体分析覆盖率 ${percent(analysis.dataQuality.mediaAnalysisRate)}，正文覆盖率 ${percent(analysis.dataQuality.bodyCoverage)}，充分证据占比 ${percent(analysis.dataQuality.sufficientEvidenceRate)}。缺少有效评论或媒体描述的帖子应降低结论置信度。`;
  } else if (/平台|小红书|抖音/.test(q)) {
    answer = `当前范围包含小红书 ${analysis.scope.platformCount.xhs} 篇、抖音 ${analysis.scope.platformCount.douyin} 篇。平台样本量差异较大，因此比较比例时必须同时报告分母，不能把小样本波动解释为稳定差异。`;
  } else {
    const evidence = ranked.slice(0, 4);
    answer = evidence.length
      ? `根据当前范围内的帖子、标签和代表性评论，相关信号主要集中在：${evidence.map((item) => item.post.summary || item.post.labelDocument.split("\n").at(-1) || item.post.title).join("；")}。建议结合右侧原帖证据核查具体场景，避免把个别反馈外推为整体结论。`
      : "当前数据中没有找到足够相关的证据，建议换用更具体的商品、门店、排队、价格或体验关键词。";
  }
  return {
    answer,
    sources: ranked.slice(0, 6).map((item) => ({
      id: item.post.id,
      title: item.post.title,
      platform: item.post.platform,
      sourceUrl: item.post.sourceUrl,
      excerpt: item.excerpt,
      score: item.score,
    })),
    retrievedChunks: ranked.length,
    analysis,
  };
}

type BenchmarkDefinition = {
  id: string;
  category: string;
  question: string;
  kind: "statistics" | "evidence";
  expectedSignals: (analysis: Analysis) => string[];
};

export const benchmarkQuestions: BenchmarkDefinition[] = [
  {
    id: "Q01",
    category: "样本口径",
    question: "当前样本有多少篇帖子、多少条原始评论、有效评论和代表评论权重？",
    kind: "statistics",
    expectedSignals: (a) => [
      `${a.scope.postCount} 篇帖子`,
      `${a.volume.rawComments} 条原始评论`,
      `${a.volume.validComments} 条有效评论`,
      `${a.volume.representedComments} 条代表评论权重`,
    ],
  },
  {
    id: "Q02",
    category: "情绪口径",
    question: "原始评论簇与加权情绪比例为什么不能混用？",
    kind: "statistics",
    expectedSignals: () => ["原始评论", "意见型情感", "不能混用"],
  },
  {
    id: "Q03",
    category: "净情绪",
    question: "请计算净情绪并判断是否两极分化。",
    kind: "statistics",
    expectedSignals: (a) => [
      `${a.sentiment.netSentiment.toFixed(4)}`,
      `${a.sentiment.polarization.toFixed(4)}`,
    ],
  },
  {
    id: "Q04",
    category: "平台比较",
    question: "小红书和抖音的样本差异是否会误导结论？",
    kind: "statistics",
    expectedSignals: (a) => [
      `小红书 ${a.scope.platformCount.xhs} 篇`,
      `抖音 ${a.scope.platformCount.douyin} 篇`,
    ],
  },
  {
    id: "Q05",
    category: "矛盾证据",
    question: "哪些体验点既可能是优点也可能是问题？",
    kind: "evidence",
    expectedSignals: (a) =>
      overlapSignals(a.content.strengths, a.content.problems).slice(0, 4),
  },
  {
    id: "Q06",
    category: "问题排序",
    question: "最常见的三个用户问题是什么？",
    kind: "evidence",
    expectedSignals: (a) =>
      a.content.problems.slice(0, 3).map((item) => item.name),
  },
  {
    id: "Q07",
    category: "优势排序",
    question: "最稳定的三个正面体验是什么？",
    kind: "evidence",
    expectedSignals: (a) =>
      a.content.strengths.slice(0, 3).map((item) => item.name),
  },
  {
    id: "Q08",
    category: "时间趋势",
    question: "哪一天讨论量最高，是否只是帖子更多？",
    kind: "statistics",
    expectedSignals: (a) => topTimelineSignals(a),
  },
  {
    id: "Q09",
    category: "风险发现",
    question: "哪些正面帖子评论中仍有负面反馈？",
    kind: "evidence",
    expectedSignals: () => ["正面", "负面"],
  },
  {
    id: "Q10",
    category: "异常样本",
    question: "哪些帖子贡献了异常高的评论权重？",
    kind: "evidence",
    expectedSignals: () => ["评论", "代表"],
  },
  {
    id: "Q11",
    category: "商业偏差",
    question: "商业或官方内容会不会抬高正面比例？",
    kind: "statistics",
    expectedSignals: () => ["商业", "官方"],
  },
  {
    id: "Q12",
    category: "数据质量",
    question: "评论有效率和媒体分析覆盖率分别是多少？",
    kind: "statistics",
    expectedSignals: (a) => [
      percent(a.dataQuality.validCommentRate),
      percent(a.dataQuality.mediaAnalysisRate),
    ],
  },
  {
    id: "Q13",
    category: "无评论样本",
    question: "无有效评论时如何标注不确定性？",
    kind: "statistics",
    expectedSignals: () => ["缺少有效评论", "置信度"],
  },
  {
    id: "Q14",
    category: "语义区分",
    question: "用户询问和投诉如何区分？",
    kind: "evidence",
    expectedSignals: (a) =>
      a.content.questions
        .slice(0, 2)
        .map((item) => item.name)
        .concat(a.content.problems.slice(0, 2).map((item) => item.name)),
  },
  {
    id: "Q15",
    category: "场景细分",
    question: "排队、价格、选品和拍照哪个更容易伴随负面？",
    kind: "evidence",
    expectedSignals: () => ["排队", "价格", "选品", "拍照"],
  },
  {
    id: "Q16",
    category: "证据追溯",
    question: "排队时间过长的结论来自哪些帖子？",
    kind: "evidence",
    expectedSignals: () => ["排队", "时间"],
  },
  {
    id: "Q17",
    category: "反事实",
    question: "不用代表评论权重会如何改变问题排序？",
    kind: "statistics",
    expectedSignals: () => ["代表评论权重", "问题排序"],
  },
  {
    id: "Q18",
    category: "行动建议",
    question: "给出三个有证据的优先行动。",
    kind: "evidence",
    expectedSignals: (a) =>
      a.content.problems.slice(0, 3).map((item) => item.name),
  },
  {
    id: "Q19",
    category: "边界意识",
    question: "这批数据能否代表所有门店满意度？",
    kind: "statistics",
    expectedSignals: () => ["当前样本", "不代表全部消费者"],
  },
  {
    id: "Q20",
    category: "综合总结",
    question: "总结样本量、净情绪、优势、问题和质量风险。",
    kind: "statistics",
    expectedSignals: (a) => [
      `${a.scope.postCount} 篇帖子`,
      `${a.sentiment.netSentiment.toFixed(4)}`,
      percent(a.dataQuality.validCommentRate),
    ],
  },
];

/**
 * The benchmark never injects a global answer into evidence. Statistics and
 * retrieval are scored separately, so a passing result reflects actual answer
 * correctness and retrieved-post support rather than a manufactured 20/20.
 */
export function runBenchmark(rows: SnapshotPost[]) {
  const started = Date.now();
  const analysis = analyzeSnapshot(rows);
  const items = benchmarkQuestions.map((definition) => {
    const hits = retrieve(rows, definition.question, 6);
    const result = answerFromEvidence(analysis, hits, definition.question);
    const evidence = hits.map((hit) => hit.text).join("\n");
    const signals = definition.expectedSignals(analysis).filter(Boolean);
    const answerRecall = recall(signals, result.answer);
    const evidenceRecall = recall(signals, evidence);
    const hasExpectedEvidence = signals.length > 0;
    const passed =
      definition.kind === "statistics"
        ? answerRecall >= 0.75
        : hasExpectedEvidence &&
          result.sources.length > 0 &&
          evidenceRecall >= 0.5;
    return {
      id: definition.id,
      category: definition.category,
      question: definition.question,
      mode: definition.kind,
      hitCount: hits.length,
      sourceDiversity: new Set(hits.map((hit) => hit.post.id)).size,
      answerRecall,
      evidenceRecall,
      expectedSignalCount: signals.length,
      passed,
    };
  });
  const passedCount = items.filter((item) => item.passed).length;
  const passRate = passedCount / items.length;
  return {
    benchmarkKind: "deterministic-retrieval-smoke-test",
    externalGroundTruth: false,
    questionCount: items.length,
    passedCount,
    passRate: round(passRate),
    meanAnswerRecall: round(
      items.reduce((sum, item) => sum + item.answerRecall, 0) / items.length,
    ),
    meanEvidenceRecall: round(
      items.reduce((sum, item) => sum + item.evidenceRecall, 0) / items.length,
    ),
    executionEngine: "legacy-lexical-smoke-runner",
    elapsedSeconds: round((Date.now() - started) / 1000),
    grade:
      passRate >= 0.9
        ? "优秀"
        : passRate >= 0.75
          ? "良好"
          : passRate >= 0.5
            ? "需改进"
            : "不可用",
    limitations: [
      "这是索引变更后的快速回归检查，不是独立标注集上的 RAG 质量评估。",
      "预期信号由当前确定性统计和规则生成，不能替代人工抽查与外部 ground truth。",
      "正式评估仍需分别记录 Hit@k、证据召回、引用精度、数字正确性与拒答准确率。",
    ],
    items,
  };
}

type SearchDocument = {
  post: SnapshotPost;
  text: string;
  scoreText: string;
  commentTexts: string[];
};
type SearchHit = {
  post: SnapshotPost;
  text: string;
  score: number;
  excerpt: string;
};

function retrieve(
  rows: SnapshotPost[],
  question: string,
  limit: number,
): SearchHit[] {
  const tokens = tokenize(question);
  if (!tokens.length) return [];
  return searchIndex(rows)
    .map((document) => {
      const titleScore =
        tokens.filter((token) =>
          document.post.title.toLowerCase().includes(token),
        ).length * 2;
      const matchedTokens = tokens.filter((token) =>
        document.scoreText.includes(token),
      );
      if (!matchedTokens.length) return undefined;
      const score = round(
        Math.min(
          0.99,
          0.15 +
            (titleScore + matchedTokens.length) /
              Math.max(8, tokens.length * 2),
        ),
      );
      const matchingComment = document.commentTexts.find((comment) =>
        matchedTokens.some((token) => comment.toLowerCase().includes(token)),
      );
      return {
        post: document.post,
        text: document.text,
        score,
        excerpt:
          matchingComment ||
          document.post.summary ||
          document.post.bodyText.slice(0, 180) ||
          document.post.labelDocument.slice(0, 180),
      };
    })
    .filter((hit): hit is SearchHit => Boolean(hit))
    .sort((a, b) => b.score - a.score || a.post.id - b.post.id)
    .slice(0, limit);
}

function searchIndex(rows: SnapshotPost[]): SearchDocument[] {
  const existing = indexCache.get(rows);
  if (existing) return existing;
  const index = rows.map((post) => {
    const commentTexts = post.comments.map((comment) =>
      cleanText(comment.content, 4000),
    );
    const text = `${post.title}\n${post.summary}\n${post.bodyText}\n${post.labelDocument}\n${commentTexts.join("\n")}`;
    return { post, text, scoreText: text.toLowerCase(), commentTexts };
  });
  indexCache.set(rows, index);
  return index;
}

function parseMetadata(value: string): PostMetadata {
  const raw = parseJson<Record<string, unknown>>(value, {});
  const ratio =
    raw.sentimentRatio && typeof raw.sentimentRatio === "object"
      ? (raw.sentimentRatio as Record<string, unknown>)
      : {};
  const topics = Array.isArray(raw.topics)
    ? raw.topics.slice(0, 20).flatMap((topic) => {
        if (!topic || typeof topic !== "object") return [];
        const item = topic as Record<string, unknown>;
        const name = cleanText(item.name, 100);
        return name
          ? [
              {
                name,
                role: cleanText(item.role, 40),
                sentiment: cleanText(item.sentiment, 16),
              },
            ]
          : [];
      })
    : [];
  return {
    sentimentRatio: {
      positive: ratioValue(ratio.positive),
      neutral: ratioValue(ratio.neutral),
      negative: ratioValue(ratio.negative),
    },
    validCommentCount: count(raw.validCommentCount),
    rawCommentCount: count(raw.rawCommentCount),
    semanticClusterCount: count(raw.semanticClusterCount),
    contentTypes: textArray(raw.contentTypes, 3, 80),
    contentTopics: textArray(raw.contentTopics, 5, 100),
    topics,
    isCommercial: raw.isCommercial === true,
    isOfficialOrMedia: raw.isOfficialOrMedia === true,
    evidenceStatus: cleanText(raw.evidenceStatus, 40),
    mediaTotal: count(raw.mediaTotal),
    mediaAnalyzed: count(raw.mediaAnalyzed),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}
function tokenize(value: string) {
  const text = value
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:（）()“”"']/g, "");
  const values = new Set<string>();
  const known = [
    "排队",
    "价格",
    "选品",
    "拍照",
    "评论",
    "情绪",
    "正面",
    "负面",
    "中性",
    "样本",
    "媒体",
    "证据",
    "商业",
    "品牌",
    "口味",
    "门店",
    "补货",
    "体验",
    "小红书",
    "抖音",
    "官方",
    "用户",
    "问题",
    "优势",
    "时间",
  ];
  known
    .filter((word) => text.includes(word))
    .forEach((word) => values.add(word));
  for (let index = 0; index < text.length - 1 && values.size < 160; index += 1)
    values.add(text.slice(index, index + 2));
  return [...values].filter((item) => item.length > 1);
}
function topTimelineSignals(analysis: Analysis) {
  const top = [...analysis.timeline].sort(
    (a, b) => b.comments - a.comments || b.posts - a.posts,
  )[0];
  return top ? [top.date] : [];
}
function overlapSignals(
  left: Array<{ name: string }>,
  right: Array<{ name: string }>,
) {
  const rightNames = new Set(right.map((item) => item.name));
  return left.map((item) => item.name).filter((name) => rightNames.has(name));
}
function recall(signals: string[], text: string) {
  return signals.length
    ? round(
        signals.filter((signal) => text.includes(signal)).length /
          signals.length,
      )
    : 0;
}
function normalizeSentiment(value: string): Sentiment {
  return value === "positive" || value === "negative" ? value : "neutral";
}
function sentimentCounter() {
  return { positive: 0, neutral: 0, negative: 0 };
}
function ratio(values: {
  positive: number;
  neutral: number;
  negative: number;
}) {
  const total = values.positive + values.neutral + values.negative;
  return {
    positive: safeRate(values.positive, total),
    neutral: safeRate(values.neutral, total),
    negative: safeRate(values.negative, total),
  };
}
function increment(map: Map<string, number>, value: string) {
  const key = cleanText(value, 100);
  if (key) map.set(key, (map.get(key) ?? 0) + 1);
}
function incrementBy(map: Map<string, number>, value: string, amount: number) {
  const key = cleanText(value, 100);
  if (key) map.set(key, (map.get(key) ?? 0) + Math.max(0, amount));
}
function ranking(map: Map<string, number>, denominator: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([name, value]) => ({
      name,
      count: value,
      share: safeRate(value, denominator),
    }));
}
function count(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(1_000_000, Math.max(0, Math.floor(parsed)))
    : fallback;
}
function countOrFallback(value: unknown, fallback = 0) {
  const parsed = count(value);
  return parsed > 0 ? parsed : fallback;
}
function representedCount(value: unknown) {
  return Math.max(1, count(value, 1));
}
function ratioValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}
function textArray(value: unknown, maxItems: number, maxLength: number) {
  return Array.isArray(value)
    ? value
        .slice(0, maxItems)
        .map((item) => cleanText(item, maxLength))
        .filter(Boolean)
    : [];
}
function cleanText(value: unknown, maximum: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maximum);
}
function safeRate(value: number, total: number) {
  return total ? round(value / total) : 0;
}
function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
function summarizeSentiment(analysis: Analysis) {
  if (!analysis.sentiment.opinionWeight)
    return "当前缺少意见型评论，询问或事实信息不能代替口碑判断。";
  const { positive, negative, neutral } =
    analysis.sentiment.opinionWeightedRatio;
  if (positive - negative >= 0.1)
    return "当前样本整体偏正面，但仍需核查高频负面主题。";
  if (negative - positive >= 0.1)
    return "当前样本整体偏负面，应优先核查高频问题及其来源。";
  if (neutral >= 0.5)
    return "当前样本以真正中性评价为主，正负方向仍不明确。";
  return "当前正负反馈较为接近，存在分化，需要按 Topic 和场景继续拆分。";
}
