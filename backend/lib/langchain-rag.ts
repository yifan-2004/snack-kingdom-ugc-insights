import { Document } from "@langchain/core/documents";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import {
  analyzeSnapshot,
  benchmarkQuestions,
  type Analysis,
  type SnapshotPost,
} from "./intelligence";
import { isOpinionBearing } from "./opinion";
import { englishArchiveAnswer, type OutputLocale } from "./localized-analysis";

type Sentiment = "positive" | "neutral" | "negative";
type RagRoute = "statistics" | "evidence";
type StatisticIntent =
  | "negative_comments"
  | "positive_comments"
  | "neutral_comments"
  | "sentiment_distribution"
  | "sentiment_method"
  | "sample_scope"
  | "platform_scope"
  | "data_quality"
  | "no_comment_uncertainty"
  | "weighting_counterfactual"
  | "sample_boundary"
  | "sample_bias"
  | "timeline_peak"
  | "overall_summary";

type RagPolicy = "prompt_injection" | "fabrication" | "ambiguous";

type EvidenceMetadata = {
  chunkId: string;
  sourceId: string;
  sourceType: "post" | "comment";
  postId: number;
  commentId?: number;
  externalId: string;
  title: string;
  platform: string;
  sourceUrl?: string;
  publishedAt?: string;
  sentiment: Sentiment;
  representedCount: number;
  topics: string[];
  isCommercial: boolean;
  isOfficialOrMedia: boolean;
};

type EvidenceDocument = Document<EvidenceMetadata>;

type RankedEvidence = {
  document: EvidenceDocument;
  score: number;
  lexicalScore: number;
  metadataScore: number;
};

type Trace = {
  totalMs: number;
  routeMs: number;
  analysisMs: number;
  documentBuildMs: number;
  retrievalMs: number;
  generationMs: number;
  candidateChunks: number;
  retrievedChunks: number;
};

type ChainInput = {
  rows: SnapshotPost[];
  question: string;
  topK: number;
  locale?: OutputLocale;
};

type PreparedInput = ChainInput & {
  analysis: Analysis;
  route: RagRoute;
  statisticIntent?: StatisticIntent;
  policy?: RagPolicy;
  trace: Trace;
};

type RetrievedInput = PreparedInput & {
  hits: RankedEvidence[];
};

export type GroundedRagResult = {
  answer: string;
  route: RagRoute;
  engine: "langchain-runnable-deterministic-grounded-v1";
  retrievalMode: "hybrid-lexical-metadata";
  generator: "deterministic-grounded-no-llm";
  modelUsed: false;
  vectorStoreUsed: false;
  trace: Trace;
  sources: Array<{
    id: number;
    title: string;
    platform: string;
    sourceUrl?: string;
    excerpt: string;
    score: number;
  }>;
  evidence: Array<{
    chunkId: string;
    sourceId: string;
    sourceType: "post" | "comment";
    postId: number;
    commentId?: number;
    title: string;
    platform: string;
    sourceUrl?: string;
    excerpt: string;
    sentiment: Sentiment;
    representedCount: number;
    score: number;
    lexicalScore: number;
    metadataScore: number;
  }>;
  retrievedChunks: number;
  analysis: Analysis;
  limitations: string[];
};

const ENGINE = "langchain-runnable-deterministic-grounded-v1" as const;
const RETRIEVAL_MODE = "hybrid-lexical-metadata" as const;
const GENERATOR = "deterministic-grounded-no-llm" as const;
const MAX_CHUNKS_PER_POST = 2;
const documentCache = new WeakMap<SnapshotPost[], EvidenceDocument[]>();

const prepare = RunnableLambda.from<ChainInput, PreparedInput>((input) => {
  const trace = emptyTrace();
  const analysisStarted = now();
  const analysis = analyzeSnapshot(input.rows);
  trace.analysisMs = elapsed(analysisStarted);

  const routeStarted = now();
  const routing = classifyQuestion(input.question);
  trace.routeMs = elapsed(routeStarted);
  return { ...input, ...routing, analysis, trace };
});

const retrieveEvidence = RunnableLambda.from<PreparedInput, RetrievedInput>(
  (input) => {
    const buildStarted = now();
    const documents = buildDocuments(input.rows);
    input.trace.documentBuildMs = elapsed(buildStarted);
    input.trace.candidateChunks = documents.length;

    const retrievalStarted = now();
    const hits = input.policy
      ? []
      : rankDocuments(
          documents,
          expandAnalyticalQuery(input.question, input.analysis),
          input.topK,
        );
    input.trace.retrievalMs = elapsed(retrievalStarted);
    input.trace.retrievedChunks = hits.length;
    return { ...input, hits };
  },
);

const generateGroundedAnswer = RunnableLambda.from<
  RetrievedInput,
  GroundedRagResult
>((input) => {
  const generationStarted = now();
  const answer = input.locale === "en" ? englishArchiveAnswer(input.question, input.rows, input.hits.length > 0, input.policy) : input.policy
    ? policyAnswer(input.policy)
    : input.route === "statistics"
      ? statisticsAnswer(
          input.rows,
          input.analysis,
          input.statisticIntent ?? "sample_scope",
        )
      : evidenceAnswer(input.question, input.hits);
  input.trace.generationMs = elapsed(generationStarted);

  const evidence = input.hits.map(toEvidence);
  return {
    answer,
    route: input.route,
    engine: ENGINE,
    retrievalMode: RETRIEVAL_MODE,
    generator: GENERATOR,
    modelUsed: false,
    vectorStoreUsed: false,
    trace: input.trace,
    // Keep the original front-end contract: one source card per post.
    sources: legacySources(evidence),
    evidence,
    retrievedChunks: evidence.length,
    analysis: input.analysis,
    limitations: [
      "当前未配置模型密钥，回答由确定性 grounded generator 生成。",
      "当前检索使用词法与 metadata 信号，没有使用 embedding 或向量数据库。",
      "精确统计来自当前载入范围的确定性分析；证据检索不负责计算全量数字。",
    ],
  };
});

const groundedRagChain = RunnableSequence.from([
  prepare,
  retrieveEvidence,
  generateGroundedAnswer,
]);

/**
 * An honest LangChain orchestration layer. LangChain provides Documents and
 * Runnable composition; retrieval and generation remain deterministic until a
 * real model and a durable vector index are configured.
 */
export async function runGroundedRag(input: {
  rows: SnapshotPost[];
  question: string;
  topK?: number;
  locale?: OutputLocale;
}): Promise<GroundedRagResult> {
  const started = now();
  const result = await groundedRagChain.invoke({
    rows: input.rows,
    question: input.question,
    locale: input.locale,
    topK: clamp(Math.floor(input.topK ?? 8), 1, 12),
  });
  result.trace.totalMs = elapsed(started);
  return result;
}

/**
 * Runs the 20-question regression suite through the same router, retriever and
 * grounded-answer functions used by /api/rag. Structured statistics are scored
 * from the generated answer; evidence questions are scored only against the
 * chunks retrieved for that question.
 */
export function runGroundedBenchmark(rows: SnapshotPost[]) {
  const started = now();
  const analysis = analyzeSnapshot(rows);
  const documents = buildDocuments(rows);
  const items = benchmarkQuestions.map((definition) => {
    const routing = classifyQuestion(definition.question);
    const hits = routing.policy
      ? []
      : rankDocuments(
          documents,
          expandAnalyticalQuery(definition.question, analysis),
          8,
        );
    const answer = routing.policy
      ? policyAnswer(routing.policy)
      : routing.route === "statistics"
        ? statisticsAnswer(
            rows,
            analysis,
            routing.statisticIntent ?? "sample_scope",
          )
        : evidenceAnswer(definition.question, hits);
    const evidenceText = hits
      .map((hit) => {
        const metadata = hit.document.metadata;
        return [
          hit.document.pageContent,
          metadata.sourceType === "comment" ? "评论" : "帖子",
          metadata.sentiment === "positive"
            ? "正面"
            : metadata.sentiment === "negative"
              ? "负面"
              : "中性",
          `代表评论权重 ${metadata.representedCount}`,
          metadata.isCommercial ? "商业" : "",
          metadata.isOfficialOrMedia ? "官方 媒体" : "",
          ...metadata.topics,
        ].join(" ");
      })
      .join("\n");
    const signals = definition.expectedSignals(analysis).filter(Boolean);
    const answerRecall = signalRecall(signals, answer);
    const evidenceRecall = signalRecall(signals, evidenceText);
    const passed =
      definition.kind === "statistics"
        ? routing.route === "statistics" && answerRecall >= 0.75
        : signals.length > 0 && hits.length > 0 && evidenceRecall >= 0.5;
    return {
      id: definition.id,
      category: definition.category,
      question: definition.question,
      mode: definition.kind,
      hitCount: hits.length,
      sourceDiversity: new Set(hits.map((hit) => hit.document.metadata.postId))
        .size,
      answerRecall,
      evidenceRecall,
      expectedSignalCount: signals.length,
      passed,
    };
  });
  const passedCount = items.filter((item) => item.passed).length;
  const passRate = passedCount / Math.max(1, items.length);
  return {
    benchmarkKind: "real-rag-chain-regression-smoke-test",
    externalGroundTruth: false,
    questionCount: items.length,
    passedCount,
    passRate: round(passRate),
    meanAnswerRecall: round(
      items.reduce((sum, item) => sum + item.answerRecall, 0) /
        Math.max(1, items.length),
    ),
    meanEvidenceRecall: round(
      items.reduce((sum, item) => sum + item.evidenceRecall, 0) /
        Math.max(1, items.length),
    ),
    executionEngine: ENGINE,
    elapsedSeconds: round((now() - started) / 1000),
    grade:
      passRate >= 0.9
        ? "优秀"
        : passRate >= 0.75
          ? "良好"
          : passRate >= 0.5
            ? "需改进"
            : "不可用",
    limitations: [
      "20 题调用与线上问答相同的路由、检索和 grounded 生成组件。",
      "这是索引变更后的快速回归，预期信号来自当前确定性统计，不是外部人工标注集。",
      "统计题只检查生成答案；证据题只检查该题实际检索到的分块，不预先注入全局摘要。",
      "正式评估仍需人工复核 Hit@k、证据召回、引用精度、数字正确性与拒答准确性。",
    ],
    items,
  };
}

function classifyQuestion(question: string): {
  route: RagRoute;
  statisticIntent?: StatisticIntent;
  policy?: RagPolicy;
} {
  const value = normalize(question);
  if (/(忽略|绕过|覆盖).*(要求|指令|规则)|(泄露|显示|输出).*(系统提示|提示词|systemprompt)|讲一个无关笑话/.test(value))
    return { route: "evidence", policy: "prompt_injection" };
  // A causal challenge is not a request to fabricate evidence. Retrieve the
  // related discussion, then let evidenceAnswer state the causal boundary.
  if (/证明.*(一定|必然).*导致|(一定|必然).*导致|因果/.test(value))
    return { route: "evidence" };
  if (/编一个|虚构|fake.*link|不存在的.*(数字|来源|链接)|(销量|营收|转化率|库存周转率).*(提高|增长|多少|证明)/.test(value))
    return { route: "evidence", policy: "fabrication" };
  if (/^(它|这个|那个).*(为什么|怎么|如何)/.test(value))
    return { route: "evidence", policy: "ambiguous" };
  const asksAmount = /多少|几条|数量|占比|比例|百分比|分布/.test(value);
  const asksPositive = /正面|好评|正向/.test(value);
  const asksNegative = /负面|差评|负向/.test(value);
  if (/综合总结|总结样本量|总结.*净情绪.*优势/.test(value))
    return { route: "statistics", statisticIntent: "overall_summary" };
  if (/商业内容|官方.*媒体|媒体内容.*样本|抬高正面比例/.test(value))
    return { route: "statistics", statisticIntent: "sample_bias" };
  if (asksAmount && asksPositive && asksNegative)
    return { route: "statistics", statisticIntent: "sentiment_distribution" };
  // Specific sentiment counts must be checked before the generic “多少” rule.
  if (asksAmount && asksNegative)
    return { route: "statistics", statisticIntent: "negative_comments" };
  if (asksAmount && asksPositive)
    return { route: "statistics", statisticIntent: "positive_comments" };
  if (asksAmount && /中性/.test(value))
    return { route: "statistics", statisticIntent: "neutral_comments" };
  if (/净情绪|两极|情绪分布|情感分布|正负比例|口碑比例/.test(value))
    return { route: "statistics", statisticIntent: "sentiment_distribution" };
  if (
    /原始评论簇|加权情绪|情绪口径|情感.*口径|情绪.*方法|情感.*方法|意见型.*分母|为什么.*中性|不能混用/.test(
      value,
    )
  )
    return { route: "statistics", statisticIntent: "sentiment_method" };
  if (/评论有效率|媒体分析覆盖率|正文覆盖率|数据质量|数据覆盖/.test(value))
    return { route: "statistics", statisticIntent: "data_quality" };
  if (
    /小红书|抖音|平台|各平台|平台样本/.test(value)
  )
    return { route: "statistics", statisticIntent: "platform_scope" };
  if (/无有效评论|没有有效评论|无评论样本/.test(value))
    return { route: "statistics", statisticIntent: "no_comment_uncertainty" };
  if (/不用代表评论权重|去掉.*representedcount|反事实/.test(value))
    return { route: "statistics", statisticIntent: "weighting_counterfactual" };
  if (/代表所有|所有门店|全部消费者|外推/.test(value))
    return { route: "statistics", statisticIntent: "sample_boundary" };
  if (/哪一天|时间趋势|讨论量最高|峰值日期/.test(value))
    return { route: "statistics", statisticIntent: "timeline_peak" };
  if (
    /多少|样本量|原始评论|有效评论|代表评论|语义簇|帖子总数/.test(
      value,
    )
  )
    return { route: "statistics", statisticIntent: "sample_scope" };
  return { route: "evidence" };
}

function buildDocuments(rows: SnapshotPost[]): EvidenceDocument[] {
  const cached = documentCache.get(rows);
  if (cached) return cached;
  const documents: EvidenceDocument[] = [];
  const fingerprints = new Set<string>();

  for (const post of rows) {
    const postSourceId = `post:${stableHash(`${post.platform}:${post.externalId}`)}`;
    const topics = unique([
      ...post.metadata.contentTopics,
      ...post.metadata.topics.map((topic) => topic.name),
    ]);
    const postText = compactText(
      [post.title, post.summary, post.bodyText, post.labelDocument]
        .filter(Boolean)
        .join("\n"),
      12_000,
    );
    if (postText) {
      const chunkId = `${postSourceId}:content`;
      documents.push(
        new Document<EvidenceMetadata>({
          id: chunkId,
          pageContent: postText,
          metadata: {
            chunkId,
            sourceId: postSourceId,
            sourceType: "post",
            postId: post.id,
            externalId: post.externalId,
            title: post.title,
            platform: post.platform,
            sourceUrl: post.sourceUrl,
            publishedAt: post.publishedAt ?? undefined,
            sentiment: normalizeSentiment(post.sentiment),
            representedCount: 1,
            topics,
            isCommercial: post.metadata.isCommercial,
            isOfficialOrMedia: post.metadata.isOfficialOrMedia,
          },
        }),
      );
      fingerprints.add(`${post.id}:${stableHash(normalize(postText))}`);
    }

    for (const comment of post.comments) {
      const content = compactText(comment.content, 4_000);
      if (!content) continue;
      const contentHash = stableHash(normalize(content));
      // Exact post-local duplicates do not consume multiple Top-k slots.
      const fingerprint = `${post.id}:${contentHash}`;
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      const sourceId = `comment:${stableHash(
        `${post.platform}:${post.externalId}:${contentHash}`,
      )}`;
      const chunkId = `${sourceId}:content`;
      documents.push(
        new Document<EvidenceMetadata>({
          id: chunkId,
          pageContent: content,
          metadata: {
            chunkId,
            sourceId,
            sourceType: "comment",
            postId: post.id,
            commentId: comment.id,
            externalId: post.externalId,
            title: post.title,
            platform: post.platform,
            sourceUrl: post.sourceUrl,
            publishedAt: post.publishedAt ?? undefined,
            sentiment: normalizeSentiment(comment.sentiment),
            representedCount: representedCount(comment.representedCount),
            topics,
            isCommercial: post.metadata.isCommercial,
            isOfficialOrMedia: post.metadata.isOfficialOrMedia,
          },
        }),
      );
    }
  }
  documentCache.set(rows, documents);
  return documents;
}

function rankDocuments(
  documents: EvidenceDocument[],
  question: string,
  topK: number,
): RankedEvidence[] {
  const terms = tokenize(question);
  const normalizedQuestion = normalize(question);
  const ranked = documents
    .map((document) => scoreDocument(document, normalizedQuestion, terms))
    .filter((item): item is RankedEvidence => Boolean(item))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.metadata.chunkId.localeCompare(
          right.document.metadata.chunkId,
        ),
    );

  const selected: RankedEvidence[] = [];
  const chunkIds = new Set<string>();
  const postCounts = new Map<number, number>();
  for (const item of ranked) {
    const metadata = item.document.metadata;
    if (chunkIds.has(metadata.chunkId)) continue;
    const currentPostCount = postCounts.get(metadata.postId) ?? 0;
    if (currentPostCount >= MAX_CHUNKS_PER_POST) continue;
    chunkIds.add(metadata.chunkId);
    postCounts.set(metadata.postId, currentPostCount + 1);
    selected.push(item);
    if (selected.length >= topK) break;
  }
  return selected;
}

function scoreDocument(
  document: EvidenceDocument,
  question: string,
  terms: string[],
): RankedEvidence | undefined {
  const text = normalize(document.pageContent);
  const title = normalize(document.metadata.title);
  const topicText = normalize(document.metadata.topics.join(" "));
  const maximumLexicalWeight = terms.reduce(
    (sum, term) => sum + termWeight(term),
    0,
  );
  let matchedLexicalWeight = 0;
  for (const term of terms) {
    if (text.includes(term)) matchedLexicalWeight += termWeight(term);
    if (title.includes(term)) matchedLexicalWeight += termWeight(term) * 0.35;
  }
  const lexicalScore = clamp(
    matchedLexicalWeight / Math.max(1, maximumLexicalWeight * 1.35),
    0,
    1,
  );

  let metadataSignals = 0;
  let metadataMatches = 0;
  const scoreSignal = (active: boolean, matched: boolean) => {
    if (!active) return;
    metadataSignals += 1;
    if (matched) metadataMatches += 1;
  };
  scoreSignal(/小红书|xhs/.test(question), document.metadata.platform === "xhs");
  scoreSignal(/抖音|douyin/.test(question), document.metadata.platform === "douyin");
  scoreSignal(
    /负面|差评|负向/.test(question),
    document.metadata.sentiment === "negative",
  );
  scoreSignal(
    /正面|好评|正向/.test(question),
    document.metadata.sentiment === "positive",
  );
  scoreSignal(/中性/.test(question), document.metadata.sentiment === "neutral");
  scoreSignal(/评论/.test(question), document.metadata.sourceType === "comment");
  scoreSignal(
    document.metadata.topics.some((topic) => question.includes(normalize(topic))),
    document.metadata.topics.some((topic) => topicText.includes(normalize(topic))),
  );
  const metadataScore = metadataSignals
    ? metadataMatches / metadataSignals
    : 0;
  const score = round(lexicalScore * 0.78 + metadataScore * 0.22);
  if (score <= 0) return undefined;
  return {
    document,
    score,
    lexicalScore: round(lexicalScore),
    metadataScore: round(metadataScore),
  };
}

function statisticsAnswer(
  rows: SnapshotPost[],
  analysis: Analysis,
  intent: StatisticIntent,
) {
  const recordCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const row of rows)
    for (const comment of row.comments)
      if (isOpinionBearing(comment.opinionKind))
        recordCounts[normalizeSentiment(comment.sentiment)] += 1;

  if (
    intent === "negative_comments" ||
    intent === "positive_comments" ||
    intent === "neutral_comments"
  ) {
    const sentiment = intent.split("_")[0] as Sentiment;
    const label = { positive: "正面", neutral: "中性", negative: "负面" }[
      sentiment
    ];
    const weightedCount =
      analysis.sentiment.opinionWeightedCount[sentiment];
    const weightedRatio =
      analysis.sentiment.opinionWeightedRatio[sentiment];
    return `当前意见型评论中有 ${recordCounts[sentiment]} 条${label}代表性记录；按 represented_count 还原后为 ${weightedCount} 条${label}意见权重，占意见型评论的 ${percent(weightedRatio)}。询问、事实、社交和离题内容不进入这个情感分母；代表记录数与还原权重也不能混用。`;
  }
  if (intent === "sentiment_distribution")
    return `意见型评论权重共 ${analysis.sentiment.opinionWeight} 条：正面 ${analysis.sentiment.opinionWeightedCount.positive} 条（${percent(analysis.sentiment.opinionWeightedRatio.positive)}）、真正中性评价 ${analysis.sentiment.opinionWeightedCount.neutral} 条（${percent(analysis.sentiment.opinionWeightedRatio.neutral)}）、负面 ${analysis.sentiment.opinionWeightedCount.negative} 条（${percent(analysis.sentiment.opinionWeightedRatio.negative)}）。另有 ${analysis.sentiment.nonOpinionWeight} 条询问、事实、社交或离题信号和 ${analysis.sentiment.mixedOpinionWeight} 条褒贬混合信号单独保留；净情绪值 ${analysis.sentiment.netSentiment.toFixed(4)}，两极分化指数 ${analysis.sentiment.polarization.toFixed(4)}。`;
  if (intent === "sentiment_method")
    return `原始评论、清洗后有效评论、语义簇、代表评论权重与意见型情感是不同口径，不能混用。当前为 ${analysis.volume.rawComments} 条原始评论、${analysis.volume.validComments} 条有效评论、${analysis.volume.semanticClusters} 个语义簇、${analysis.volume.representedComments} 条代表评论权重；其中 ${analysis.sentiment.opinionWeight} 条意见权重进入情感分母，${analysis.sentiment.nonOpinionWeight} 条询问/事实/社交/离题信号另行统计，${analysis.sentiment.mixedOpinionWeight} 条褒贬混合信号保留为单独口径。`;
  if (intent === "platform_scope")
    return `当前载入范围包含小红书 ${analysis.scope.platformCount.xhs} 篇、抖音 ${analysis.scope.platformCount.douyin} 篇，共 ${analysis.scope.postCount} 篇帖子。平台比较必须同时报告各自分母。`;
  if (intent === "data_quality")
    return `当前评论有效率 ${percent(analysis.dataQuality.validCommentRate)}，媒体分析覆盖率 ${percent(analysis.dataQuality.mediaAnalysisRate)}，正文覆盖率 ${percent(analysis.dataQuality.bodyCoverage)}，充分证据占比 ${percent(analysis.dataQuality.sufficientEvidenceRate)}。`;
  if (intent === "no_comment_uncertainty") {
    const withoutComments = rows.filter((row) => row.comments.length === 0).length;
    return `当前有 ${withoutComments} 篇帖子没有可用的代表性评论记录。这些帖子只能依据帖子正文、标签或媒体描述，必须标注“缺少有效评论”并降低置信度，不应推断用户整体态度。`;
  }
  if (intent === "weighting_counterfactual")
    return `如果不使用代表评论权重，每个语义簇都只计 1 条，当前 ${analysis.volume.representedComments} 条加权意见会改按 ${analysis.volume.semanticClusters} 个簇记录计数。问题排序可能改变：重复出现的同类投诉不再体现规模，但稀有观点的相对权重会上升。这是口径反事实，不是新的因果结论。`;
  if (intent === "sample_boundary")
    return `不能。当前样本只包含 ${analysis.scope.postCount} 篇帖子（小红书 ${analysis.scope.platformCount.xhs} 篇、抖音 ${analysis.scope.platformCount.douyin} 篇）及其可用评论，不代表全部消费者或所有门店，也不能证明销量、满意度或运营指标之间的因果关系。`;
  if (intent === "sample_bias")
    return `当前样本标记了 ${analysis.sampleFlags.commercialPosts} 篇商业内容、${analysis.sampleFlags.officialOrMediaPosts} 篇官方或媒体内容，以及 ${analysis.sampleFlags.organicPosts} 篇其他内容。商业或官方内容可能带来样本偏差，但当前数据不能证明它们一定抬高正面比例；应分组报告各自分母。`;
  if (intent === "timeline_peak") {
    const peak = [...analysis.timeline].sort(
      (left, right) =>
        right.comments - left.comments ||
        right.posts - left.posts ||
        left.date.localeCompare(right.date),
    )[0];
    return peak
      ? `当前时间范围的讨论量峰值日期是 ${peak.date}，当日 ${peak.posts} 篇帖子、${peak.comments} 条代表评论权重。该数字反映当日样本规模，不能单独证明负面口碑同比恶化。`
      : "当前载入范围没有可用日期，无法计算讨论量峰值。";
  }
  if (intent === "overall_summary") {
    const strength = analysis.content.strengths[0]?.name ?? "暂无稳定优势 Topic";
    const problem = analysis.content.problems[0]?.name ?? "暂无稳定问题 Topic";
    return `当前样本 ${analysis.scope.postCount} 篇帖子、${analysis.volume.rawComments} 条原始评论、${analysis.volume.validComments} 条有效评论；净情绪值 ${analysis.sentiment.netSentiment.toFixed(4)}。高频优势是“${strength}”，高频问题是“${problem}”。数据质量警告：评论有效率 ${percent(analysis.dataQuality.validCommentRate)}，平台样本不均衡，结论只适用于当前范围。`;
  }
  return `当前载入范围包含 ${analysis.scope.postCount} 篇帖子、${analysis.volume.rawComments} 条原始评论、${analysis.volume.validComments} 条有效评论、${analysis.volume.semanticClusters} 个语义簇和 ${analysis.volume.representedComments} 条代表评论权重。原始评论、有效评论、语义簇和代表评论权重是不同口径。`;
}

function evidenceAnswer(question: string, hits: RankedEvidence[]) {
  if (!hits.length)
    return "当前载入范围没有检索到足以支持回答的文本证据。请使用更具体的商品、门店、价格、排队或体验关键词；当前确定性生成器不会在缺少证据时补写结论。";
  const normalizedQuestion = normalize(question);
  const boundary = /一定|导致|证明|因果/.test(normalizedQuestion)
    ? "当前样本只能说明存在相关反馈，不能证明必然因果关系。\n"
    : /所有用户|全部用户|普遍/.test(normalizedQuestion)
      ? "不能将当前样本外推为所有用户的普遍意见。\n"
      : "";
  const excerpts = hits
    .slice(0, 4)
    .map((hit, index) => {
      const metadata = hit.document.metadata;
      const type = metadata.sourceType === "comment" ? "评论" : "帖子";
      return `${index + 1}. [${metadata.chunkId}] ${type}《${metadata.title}》：${excerpt(hit.document.pageContent, 150)}`;
    })
    .join("\n");
  return `${boundary}当前确定性混合检索找到 ${hits.length} 个相关证据块。以下为相关度最高的原文证据，不将单条反馈外推为整体事实：\n${excerpts}`;
}

function policyAnswer(policy: RagPolicy) {
  if (policy === "prompt_injection")
    return "该请求试图改变系统规则或获取内部提示，与当前舆情证据问答无关。我不会泄露内部指令；请改问具体商品、Topic、平台或用户反馈。";
  if (policy === "fabrication")
    return "当前数据没有能够支持该数字或来源的证据。系统不会编造销量、增长率、评论链接、commentId 或 chunkId。";
  return "问题中的指代对象不明确，当前没有足够证据判断“它”指什么。请补充具体商品、门店或 Topic。";
}

function expandAnalyticalQuery(question: string, analysis: Analysis) {
  const value = normalize(question);
  const additions: string[] = [];
  if (/最常见.*问题|用户问题|优先行动/.test(value))
    additions.push(...analysis.content.problems.slice(0, 3).map((item) => item.name));
  if (/稳定.*正面|用户优势|最强.*优势/.test(value))
    additions.push(...analysis.content.strengths.slice(0, 3).map((item) => item.name));
  if (/询问.*投诉|投诉.*询问/.test(value))
    additions.push(
      ...analysis.content.questions.slice(0, 2).map((item) => item.name),
      ...analysis.content.problems.slice(0, 2).map((item) => item.name),
    );
  if (/优点.*问题|问题.*优点|矛盾证据/.test(value)) {
    const problemNames = new Set(
      analysis.content.problems.map((item) => normalize(item.name)),
    );
    additions.push(
      ...analysis.content.strengths
        .filter((item) => problemNames.has(normalize(item.name)))
        .slice(0, 4)
        .map((item) => item.name),
    );
  }
  return [question, ...unique(additions)].join(" ");
}

function toEvidence(hit: RankedEvidence) {
  const metadata = hit.document.metadata;
  return {
    chunkId: metadata.chunkId,
    sourceId: metadata.sourceId,
    sourceType: metadata.sourceType,
    postId: metadata.postId,
    commentId: metadata.commentId,
    title: metadata.title,
    platform: metadata.platform,
    sourceUrl: metadata.sourceUrl,
    excerpt: excerpt(hit.document.pageContent, 240),
    sentiment: metadata.sentiment,
    representedCount: metadata.representedCount,
    score: hit.score,
    lexicalScore: hit.lexicalScore,
    metadataScore: hit.metadataScore,
  };
}

function legacySources(evidence: GroundedRagResult["evidence"]) {
  const seen = new Set<number>();
  return evidence.flatMap((item) => {
    if (seen.has(item.postId)) return [];
    seen.add(item.postId);
    return [
      {
        id: item.postId,
        title: item.title,
        platform: item.platform,
        sourceUrl: item.sourceUrl,
        excerpt: item.excerpt,
        score: item.score,
      },
    ];
  });
}

const DOMAIN_TERMS = [
  "排队",
  "价格",
  "性价比",
  "口味",
  "甜度",
  "选品",
  "拍照",
  "门店",
  "补货",
  "服务",
  "包装",
  "健康",
  "配料",
  "复购",
  "推荐",
  "投诉",
  "评论",
  "帖子",
  "正面",
  "负面",
  "中性",
  "小红书",
  "抖音",
  "商业",
  "官方",
  "用户",
  "需求",
  "问题",
  "优势",
  "风险",
];
const STOP_TERMS = new Set([
  "什么",
  "哪些",
  "多少",
  "如何",
  "是否",
  "当前",
  "可以",
  "请问",
  "一下",
  "这个",
  "有关",
  "总结",
]);

function tokenize(value: string) {
  const normalized = normalize(value);
  const terms = new Set<string>();
  for (const term of DOMAIN_TERMS)
    if (normalized.includes(term)) terms.add(term);
  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9_-]{1,31}/g))
    terms.add(match[0]);
  for (const match of normalized.matchAll(/[\u3400-\u9fff]{2,}/g)) {
    const run = match[0];
    for (let index = 0; index < run.length - 1 && terms.size < 120; index += 1)
      terms.add(run.slice(index, index + 2));
  }
  return [...terms].filter((term) => !STOP_TERMS.has(term));
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:（）()“”"']/g, "")
    .trim();
}

function compactText(value: unknown, maximum: number) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function stableHash(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function normalizeSentiment(value: string): Sentiment {
  return value === "positive" || value === "negative" ? value : "neutral";
}

function representedCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(1_000_000, Math.floor(parsed)))
    : 1;
}

function termWeight(term: string) {
  return term.length >= 4 ? 2 : term.length === 3 ? 1.5 : 1;
}

function excerpt(value: string, maximum: number) {
  const text = compactText(value, maximum + 1);
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => compactText(value, 100)).filter(Boolean))];
}

function emptyTrace(): Trace {
  return {
    totalMs: 0,
    routeMs: 0,
    analysisMs: 0,
    documentBuildMs: 0,
    retrievalMs: 0,
    generationMs: 0,
    candidateChunks: 0,
    retrievedChunks: 0,
  };
}

function now() {
  return performance.now();
}

function elapsed(started: number) {
  return Math.round((now() - started) * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function signalRecall(signals: string[], text: string) {
  if (!signals.length) return 0;
  const searchable = normalize(text);
  return round(
    signals.filter((signal) => searchable.includes(normalize(signal))).length /
      signals.length,
  );
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
