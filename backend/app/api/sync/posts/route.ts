import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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
  topics,
} from "../../../../db/schema";
import { safeHttpUrl } from "../../../../lib/safe";
import {
  normalizeOpinionKind,
  type OpinionKind,
} from "../../../../lib/opinion";
import { invalidateSnapshotCache } from "../../../../lib/snapshot-cache";
import { readBoundedText, PublicRequestError } from "../../../../lib/request";
import {
  CLEANING_VERSION,
  PIPELINE_VERSION,
  TOPIC_VERSION,
  cleanUgcContent,
  extractAspects,
  topicSeedRows,
} from "../../../../lib/topic-pipeline";

type IncomingComment = {
  comment_id?: string;
  id?: string;
  parent_comment_id?: string;
  content?: string;
  sentiment?: string;
  like_count?: number;
  likeCount?: number;
  represented_count?: number;
  representedCount?: number;
  opinion_kind?: string;
  confidence?: number;
  aspects?: string[];
  reason?: string;
};

type IncomingPost = {
  post_id?: string;
  id?: string;
  platform?: string;
  title?: string;
  summary?: string;
  body_text?: string;
  content?: string;
  label_document?: string;
  source_url?: string;
  sentiment?: string;
  dominant_sentiment?: string;
  published_at?: string;
  like_count?: number;
  share_count?: number;
  media?: Array<{ url?: string; description?: string }>;
  sentiment_ratio?: Record<string, number>;
  comment_count?: number;
  raw_comment_count?: number;
  semantic_cluster_count?: number;
  content_types?: string[];
  content_topics?: string[];
  topics?: Array<{ name?: string; role?: string; sentiment?: string }>;
  is_commercial?: boolean;
  is_official_or_media?: boolean;
  evidence_status?: string;
  media_total?: number;
  media_analyzed?: number;
  comments?: IncomingComment[];
  comments_complete?: boolean;
};

type SyncEnvelope = {
  posts?: IncomingPost[];
  snapshot_id?: string;
  batch_id?: string;
  data_cutoff_at?: string;
  finalize?: boolean;
};

type PreparedComment = {
  externalId: string;
  parentExternalId: string | null;
  rawContent: string;
  content: string;
  cleanContent: string;
  contentHash: string;
  qualityScore: number;
  cleaningJson: string;
  sentiment: "positive" | "neutral" | "negative";
  opinionKind: OpinionKind;
  likeCount: number;
  representedCount: number;
  extractedAspects: ReturnType<typeof extractAspects>;
};

type PreparedPost = {
  externalId: string;
  platform: "xhs" | "douyin" | "unknown";
  title: string;
  summary: string;
  bodyText: string;
  labelDocument: string;
  sourceUrl?: string;
  sentiment: "positive" | "neutral" | "negative";
  mediaJson: string;
  metadataJson: string;
  contentHash: string;
  publishedAt: string | null;
  likeCount: number;
  shareCount: number;
  comments: PreparedComment[];
  replaceComments: boolean;
};

const MAX_BODY_BYTES = 1_000_000;
const MAX_D1_BATCH_STATEMENTS = 900;
const SENTIMENTS = new Set(["positive", "neutral", "negative"]);
const PLATFORMS = new Set(["xhs", "douyin", "unknown"]);
const SYNC_PROTOCOL = "snack-ugc-sync-v3";
const ACCEPTED_PROTOCOLS = new Set(["snack-ugc-sync-v2", SYNC_PROTOCOL]);
const MAX_POSTS_PER_BATCH = 2;

class SyncRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function text(value: unknown, maximum: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maximum);
}

function number(value: unknown, fallback = 0, maximum = 1_000_000) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(0, Math.floor(parsed)))
    : fallback;
}

function arrayOfText(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
) {
  return Array.isArray(value)
    ? value
        .slice(0, maximumItems)
        .map((item) => text(item, maximumLength))
        .filter(Boolean)
    : [];
}

function ratio(value: unknown) {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const toRatio = (item: unknown) => {
    const parsed = Number(item);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
  };
  return {
    positive: toRatio(input.positive),
    neutral: toRatio(input.neutral),
    negative: toRatio(input.negative),
  };
}

function normalizeSentiment(
  value: unknown,
): "positive" | "neutral" | "negative" {
  const normalized = text(value, 16);
  return SENTIMENTS.has(normalized)
    ? (normalized as "positive" | "neutral" | "negative")
    : "neutral";
}

function normalizePlatform(
  value: unknown,
): "xhs" | "douyin" | "unknown" {
  const normalized = text(value, 32);
  return PLATFORMS.has(normalized)
    ? (normalized as "xhs" | "douyin" | "unknown")
    : "unknown";
}

async function hash(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readSyncBody(
  request: Request,
): Promise<SyncEnvelope | IncomingPost[]> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json"))
    throw new SyncRequestError("同步请求必须使用 JSON 格式");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES)
    throw new SyncRequestError("同步请求过大", 413);
  let raw: string;
  try { raw = await readBoundedText(request, MAX_BODY_BYTES); }
  catch (error) {
    if (error instanceof PublicRequestError) throw new SyncRequestError(error.message,error.status);
    throw error;
  }
  try {
    const body: unknown = JSON.parse(raw);
    if (!body || (typeof body !== "object" && !Array.isArray(body)))
      throw new SyncRequestError("同步请求格式不正确");
    return body as SyncEnvelope | IncomingPost[];
  } catch (error) {
    if (error instanceof SyncRequestError) throw error;
    throw new SyncRequestError("同步请求 JSON 无法解析");
  }
}

function configuredSyncToken() {
  return (env as unknown as { SYNC_TOKEN_V2?: string }).SYNC_TOKEN_V2;
}

function suppliedSyncToken(request: Request) {
  return (
    request.headers.get("x-sync-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  );
}

function requireSyncAuthorization(request: Request) {
  if ((env as unknown as { SYNC_ENABLED?: string }).SYNC_ENABLED !== "true")
    throw new SyncRequestError("站点同步未启用，请由管理员完成配置", 409);
  const configuredToken = configuredSyncToken();
  if (!configuredToken)
    throw new SyncRequestError("网站同步尚未配置新的令牌", 503);
  if (suppliedSyncToken(request) !== configuredToken)
    throw new SyncRequestError("同步令牌无效", 401);
  const requestedProtocol = request.headers.get("x-sync-protocol");
  if (requestedProtocol && !ACCEPTED_PROTOCOLS.has(requestedProtocol))
    throw new SyncRequestError("同步协议版本不受支持，请升级本地客户端", 409);
}

async function preparePost(entry: IncomingPost): Promise<PreparedPost> {
  const externalId = text(entry.post_id ?? entry.id, 160);
  const title = text(entry.title, 500);
  if (!externalId || !title)
    throw new SyncRequestError("post_id 和 title 为必填项");

  const incomingComments = Array.isArray(entry.comments) ? entry.comments : [];
  const incomingMedia = Array.isArray(entry.media) ? entry.media : [];
  if (incomingComments.length > 500)
    throw new SyncRequestError("每篇帖子最多 500 条代表性评论");
  if (incomingMedia.length > 9)
    throw new SyncRequestError("每篇帖子最多 9 张图片");

  const media = incomingMedia
    .map((item) => ({
      url: safeHttpUrl(item?.url),
      description: text(item?.description, 1200),
    }))
    .filter((item): item is { url: string; description: string } =>
      Boolean(item.url),
    );

  const occurrenceByHash = new Map<string, number>();
  const normalizedComments = await Promise.all(
    incomingComments.map(async (incoming) => {
      const cleaned = cleanUgcContent(incoming?.content);
      return {
        incoming,
        cleaned,
        contentHash: cleaned.isValid
          ? await hash(cleaned.normalizedText)
          : "",
      };
    }),
  );
  const preparedComments: PreparedComment[] = [];
  for (const { incoming, cleaned, contentHash } of normalizedComments) {
    if (!cleaned.isValid) continue;
    const occurrence = (occurrenceByHash.get(contentHash) ?? 0) + 1;
    occurrenceByHash.set(contentHash, occurrence);
    const providedId = text(incoming.comment_id ?? incoming.id, 180);
    const rawAspects = extractAspects(cleaned);
    const opinionKind = normalizeOpinionKind(incoming.opinion_kind);
    const sentiment = normalizeSentiment(
      incoming.sentiment ?? sentimentFromAspects(rawAspects),
    );
    const sentimentConfidence = Math.min(
      1,
      Math.max(0, Number(incoming.confidence) || 0),
    );
    // Whole-comment sentiment is not evidence of each aspect's direction.
    const extractedAspects = rawAspects;
    preparedComments.push({
      externalId:
        providedId || `generated:${contentHash.slice(0, 24)}:${occurrence}`,
      parentExternalId: text(incoming.parent_comment_id, 180) || null,
      rawContent: cleaned.rawText,
      content: cleaned.normalizedText,
      cleanContent: cleaned.normalizedText,
      contentHash,
      qualityScore: cleaned.qualityScore,
      cleaningJson: JSON.stringify({
        version: cleaned.cleaningVersion,
        hashtags: cleaned.hashtags,
        emojiSignals: cleaned.emojiSignals,
        flags: cleaned.flags,
        isCommercial: cleaned.isCommercial,
        opinionKind,
        sentimentConfidence,
        sourceAspects: arrayOfText(incoming.aspects, 12, 100),
        sourceReason: text(incoming.reason, 500),
      }),
      sentiment,
      opinionKind,
      likeCount: number(incoming.like_count ?? incoming.likeCount),
      representedCount: Math.max(
        1,
        number(
          incoming.represented_count ?? incoming.representedCount,
          1,
          10_000,
        ),
      ),
      extractedAspects,
    });
  }

  const platform = normalizePlatform(entry.platform);
  const summary = text(entry.summary, 2000);
  const bodyText = text(entry.body_text ?? entry.content, 12_000);
  const labelDocument = text(entry.label_document, 12_000);
  const sentiment = normalizeSentiment(
    entry.sentiment ?? entry.dominant_sentiment,
  );
  const metadataJson = JSON.stringify({
    sentimentRatio: ratio(entry.sentiment_ratio),
    validCommentCount: number(
      entry.comment_count,
      preparedComments.reduce(
        (sum, comment) => sum + comment.representedCount,
        0,
      ),
    ),
    rawCommentCount: number(
      entry.raw_comment_count,
      incomingComments.length,
    ),
    semanticClusterCount: number(
      entry.semantic_cluster_count,
      preparedComments.length,
    ),
    contentTypes: arrayOfText(entry.content_types, 3, 80),
    contentTopics: arrayOfText(entry.content_topics, 5, 100),
    topics: Array.isArray(entry.topics)
      ? entry.topics
          .slice(0, 20)
          .map((topic) => ({
            name: text(topic?.name, 100),
            role: text(topic?.role, 40),
            sentiment: text(topic?.sentiment, 16),
          }))
          .filter((topic) => topic.name)
      : [],
    isCommercial: Boolean(entry.is_commercial),
    isOfficialOrMedia: Boolean(entry.is_official_or_media),
    evidenceStatus: text(entry.evidence_status, 40) || "limited",
    mediaTotal: number(entry.media_total, incomingMedia.length),
    mediaAnalyzed: number(
      entry.media_analyzed,
      incomingMedia.filter((item) => item.description).length,
    ),
    pipelineVersion: PIPELINE_VERSION,
    cleaningVersion: CLEANING_VERSION,
    topicVersion: TOPIC_VERSION,
  });
  const canonical = JSON.stringify({
    externalId,
    platform,
    title,
    summary,
    bodyText,
    labelDocument,
    sourceUrl: safeHttpUrl(entry.source_url),
    sentiment,
    media,
    metadataJson,
    publishedAt: text(entry.published_at, 64),
    comments: preparedComments.map((comment) => ({
      externalId: comment.externalId,
      contentHash: comment.contentHash,
      sentiment: comment.sentiment,
      likeCount: comment.likeCount,
      representedCount: comment.representedCount,
      opinionKind: comment.opinionKind,
    })),
  });

  return {
    externalId,
    platform,
    title,
    summary,
    bodyText,
    labelDocument,
    sourceUrl: safeHttpUrl(entry.source_url) || undefined,
    sentiment,
    mediaJson: JSON.stringify(media),
    metadataJson,
    contentHash: await hash(canonical),
    publishedAt: text(entry.published_at, 64) || null,
    likeCount: number(entry.like_count),
    shareCount: number(entry.share_count),
    comments: preparedComments,
    replaceComments: Array.isArray(entry.comments) && entry.comments_complete === true,
  };
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, index * size + size),
  );
}

type SyncDb = ReturnType<typeof getDb>;
type D1BatchQuery = BatchItem<"sqlite">;

async function executeAtomicD1Batch(
  db: SyncDb,
  queries: D1BatchQuery[],
) {
  if (!queries.length) return;
  if (queries.length > MAX_D1_BATCH_STATEMENTS)
    throw new SyncRequestError(
      `同步批次展开为 ${queries.length} 条数据库语句，超过安全上限，请减少本批帖子或代表评论数`,
      413,
    );
  // Cloudflare D1 rejects standalone BEGIN/COMMIT statements. Its native
  // batch API is the supported transaction primitive: statements execute in
  // order and the whole batch rolls back when any statement fails.
  await db.batch(queries as [D1BatchQuery, ...D1BatchQuery[]]);
}

function assertStableBatchKeys(prepared: PreparedPost[]) {
  const postKeys = new Set<string>();
  for (const item of prepared) {
    const postKey = `${item.platform}:${item.externalId}`;
    if (postKeys.has(postKey))
      throw new SyncRequestError(`同一批次不能重复提交帖子 ${postKey}`);
    postKeys.add(postKey);
    const commentKeys = new Set<string>();
    for (const comment of item.comments) {
      if (commentKeys.has(comment.externalId))
        throw new SyncRequestError(
          `帖子 ${postKey} 包含重复的 comment_id`,
        );
      commentKeys.add(comment.externalId);
    }
  }
}

async function persistPreparedBatch(
  db: SyncDb,
  prepared: PreparedPost[],
  options: {
    now: string;
    snapshotId: string;
    runId: string;
    dataCutoffAt: string;
    finalize: boolean;
  },
) {
  const { now, snapshotId, runId, dataCutoffAt, finalize } = options;
  const postPredicates = prepared.map((item) =>
    and(
      eq(posts.platform, item.platform),
      eq(posts.externalId, item.externalId),
    ),
  );
  const existingPostRows = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      externalId: posts.externalId,
    })
    .from(posts)
    .where(or(...postPredicates));
  const existingPostIdByKey = new Map(
    existingPostRows.map((row) => [
      `${row.platform}:${row.externalId}`,
      row.id,
    ]),
  );
  const existingPostIds = existingPostRows.map((row) => row.id);
  const existingCommentRows = existingPostIds.length
    ? await db
        .select({
          postId: comments.postId,
          externalId: comments.externalId,
          contentHash: comments.contentHash,
        })
        .from(comments)
        .where(inArray(comments.postId, existingPostIds))
    : [];
  const existingCommentHashByKey = new Map(
    existingCommentRows.flatMap((row) =>
      row.externalId
        ? [[`${row.postId}:${row.externalId}`, row.contentHash] as const]
        : [],
    ),
  );
  const postEntityKeys = prepared.map(
    (item) => `${item.platform}:${item.externalId}`,
  );
  const observationRows = await db
    .select({
      entityKey: engagementObservations.entityKey,
      likeCount: engagementObservations.likeCount,
      commentCount: engagementObservations.commentCount,
      shareCount: engagementObservations.shareCount,
    })
    .from(engagementObservations)
    .where(
      and(
        eq(engagementObservations.entityType, "post"),
        inArray(engagementObservations.entityKey, postEntityKeys),
      ),
    )
    .orderBy(desc(engagementObservations.id));
  const latestObservationByKey = new Map<
    string,
    (typeof observationRows)[number]
  >();
  for (const row of observationRows)
    if (!latestObservationByKey.has(row.entityKey))
      latestObservationByKey.set(row.entityKey, row);

  const queries: D1BatchQuery[] = [];
  for (const seedBatch of chunks(topicSeedRows(), 8))
    queries.push(
      db
        .insert(topics)
        .values(seedBatch)
        .onConflictDoNothing(),
    );
  queries.push(
    db
      .insert(snapshots)
      .values({
        id: snapshotId,
        status: "candidate",
        dataCutoffAt,
        pipelineVersion: PIPELINE_VERSION,
        cleaningVersion: CLEANING_VERSION,
        topicVersion: TOPIC_VERSION,
        indexVersion: "langchain-runnable-v1",
      })
      .onConflictDoUpdate({
        target: snapshots.id,
        set: {
          status: "candidate",
          dataCutoffAt,
          pipelineVersion: PIPELINE_VERSION,
          cleaningVersion: CLEANING_VERSION,
          topicVersion: TOPIC_VERSION,
          indexVersion: "langchain-runnable-v1",
        },
      }),
    db
      .insert(processingRuns)
      .values({
        id: runId,
        snapshotId,
        status: "processing",
        receivedCount: prepared.length,
      })
      .onConflictDoUpdate({
        target: processingRuns.id,
        set: {
          snapshotId,
          status: "processing",
          receivedCount: prepared.length,
          processedCount: 0,
          failedCount: 0,
          errorJson: "{}",
          completedAt: null,
        },
      }),
  );

  for (const item of prepared) {
    const postKey = `${item.platform}:${item.externalId}`;
    const postIdSql = sql<number>`(
      select ${posts.id} from ${posts}
      where ${posts.platform} = ${item.platform}
        and ${posts.externalId} = ${item.externalId}
      limit 1
    )`;
    const postVersionSql = sql<number>`(
      select ${posts.contentVersion} from ${posts}
      where ${posts.platform} = ${item.platform}
        and ${posts.externalId} = ${item.externalId}
      limit 1
    )`;
    queries.push(
      db
        .insert(posts)
        .values({
          externalId: item.externalId,
          platform: item.platform,
          title: item.title,
          summary: item.summary,
          bodyText: item.bodyText,
          labelDocument: item.labelDocument,
          sourceUrl: item.sourceUrl,
          sentiment: item.sentiment,
          mediaJson: item.mediaJson,
          metadataJson: item.metadataJson,
          contentHash: item.contentHash,
          contentVersion: 1,
          processingStatus: "ready",
          firstSeenAt: now,
          lastSeenAt: now,
          publishedAt: item.publishedAt,
          syncedAt: now,
        })
        .onConflictDoUpdate({
          target: [posts.platform, posts.externalId],
          set: {
            title: item.title,
            summary: item.summary,
            bodyText: item.bodyText,
            labelDocument: item.labelDocument,
            sourceUrl: item.sourceUrl,
            sentiment: item.sentiment,
            mediaJson: item.mediaJson,
            metadataJson: item.metadataJson,
            contentHash: item.contentHash,
            contentVersion: sql`case
              when ${posts.contentHash} = '' then 1
              when ${posts.contentHash} <> excluded.content_hash
                then ${posts.contentVersion} + 1
              else ${posts.contentVersion}
            end`,
            processingStatus: "ready",
            lastSeenAt: now,
            publishedAt: item.publishedAt,
            syncedAt: now,
          },
        }),
      db
        .insert(contentVersions)
        .values({
          entityType: "post",
          entityKey: postKey,
          version: postVersionSql,
          contentHash: item.contentHash,
          rawText: [item.title, item.summary, item.bodyText].join("\n"),
          normalizedText: [item.title, item.summary, item.bodyText].join(
            "\n",
          ),
          observedAt: now,
        })
        .onConflictDoNothing(),
      db
        .update(comments)
        .set({ isCurrent: false })
        .where(
          and(
            eq(comments.postId, postIdSql),
            eq(comments.isCurrent, true),
            sql`${item.replaceComments ? 1 : 0} = 1`,
          ),
        ),
    );

    for (const commentBatch of chunks(item.comments, 6))
      queries.push(
        db
          .insert(comments)
          .values(
            commentBatch.map((comment) => ({
              postId: postIdSql,
              externalId: comment.externalId,
              parentExternalId: comment.parentExternalId,
              rawContent: comment.rawContent,
              content: comment.content,
              cleanContent: comment.cleanContent,
              contentHash: comment.contentHash,
              qualityScore: comment.qualityScore,
              cleaningJson: comment.cleaningJson,
              sentiment: comment.sentiment,
              likeCount: comment.likeCount,
              representedCount: comment.representedCount,
              isCurrent: true,
              syncedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: [comments.postId, comments.externalId],
            set: {
              parentExternalId: sql`excluded.parent_external_id`,
              rawContent: sql`excluded.raw_content`,
              content: sql`excluded.content`,
              cleanContent: sql`excluded.clean_content`,
              contentHash: sql`excluded.content_hash`,
              qualityScore: sql`excluded.quality_score`,
              cleaningJson: sql`excluded.cleaning_json`,
              sentiment: sql`excluded.sentiment`,
              likeCount: sql`excluded.like_count`,
              representedCount: sql`excluded.represented_count`,
              isCurrent: true,
              syncedAt: now,
            },
          }),
      );

    for (const externalIdBatch of chunks(
      item.comments.map((comment) => comment.externalId),
      80,
    )) {
      const incomingCommentIds = db
        .select({ id: comments.id })
        .from(comments)
        .where(
          and(
            eq(comments.postId, postIdSql),
            inArray(comments.externalId, externalIdBatch),
          ),
        );
      queries.push(
        db.delete(aspects).where(inArray(aspects.commentId, incomingCommentIds)),
      );
    }

    const existingPostId = existingPostIdByKey.get(postKey);
    const commentChanged = (comment: PreparedComment) =>
      !existingPostId ||
      existingCommentHashByKey.get(
        `${existingPostId}:${comment.externalId}`,
      ) !== comment.contentHash;
    const commentIdSql = (externalId: string) => sql<number>`(
      select ${comments.id} from ${comments}
      where ${comments.postId} = ${postIdSql}
        and ${comments.externalId} = ${externalId}
      limit 1
    )`;
    const aspectValues = item.comments.flatMap((comment) =>
      comment.extractedAspects.map((aspect) => ({
        commentId: commentIdSql(comment.externalId),
        topicId: aspect.topicId,
        evidenceText: aspect.evidenceText,
        normalizedText: aspect.normalizedText,
        sentiment: aspect.sentiment,
        sentimentScore: aspect.sentimentScore,
        confidence: aspect.confidence,
        matchScore: aspect.matchScore,
        assignmentStatus: aspect.assignmentStatus,
        processingVersion: PIPELINE_VERSION,
      })),
    );
    for (const aspectBatch of chunks(aspectValues, 6))
      queries.push(db.insert(aspects).values(aspectBatch));

    const commentVersionValues = item.comments.flatMap((comment) =>
      commentChanged(comment)
        ? [
            {
              entityType: "comment",
              entityKey: `${postKey}:${comment.externalId}`,
              version: postVersionSql,
              contentHash: comment.contentHash,
              rawText: comment.rawContent,
              normalizedText: comment.cleanContent,
              observedAt: now,
            },
          ]
        : [],
    );
    for (const versionBatch of chunks(commentVersionValues, 10))
      queries.push(
        db
          .insert(contentVersions)
          .values(versionBatch)
          .onConflictDoNothing(),
      );

    const candidateByLabel = new Map<string, { sampleJson: string }>();
    for (const comment of item.comments) {
      for (const aspect of comment.extractedAspects) {
        if (aspect.assignmentStatus !== "candidate") continue;
        const sampleJson = JSON.stringify([
          {
            post: postKey,
            comment: comment.externalId,
            evidence: aspect.evidenceText.slice(0, 240),
          },
        ]);
        const current = candidateByLabel.get(aspect.normalizedText);
        candidateByLabel.set(aspect.normalizedText, {
          sampleJson: current?.sampleJson ?? sampleJson,
        });
      }
    }
    for (const [normalizedLabel, candidate] of candidateByLabel) {
      const mentionCountSql = sql<number>`(
        select count(*) from ${aspects}
        inner join ${comments} on ${aspects.commentId} = ${comments.id}
        where ${aspects.assignmentStatus} = 'candidate'
          and ${aspects.normalizedText} = ${normalizedLabel}
          and ${comments.isCurrent} = 1
      )`;
      const distinctPostCountSql = sql<number>`(
        select count(distinct ${comments.postId}) from ${aspects}
        inner join ${comments} on ${aspects.commentId} = ${comments.id}
        where ${aspects.assignmentStatus} = 'candidate'
          and ${aspects.normalizedText} = ${normalizedLabel}
          and ${comments.isCurrent} = 1
      )`;
      queries.push(
        db
          .insert(topicCandidates)
          .values({
            normalizedLabel,
            sampleJson: candidate.sampleJson,
            mentionCount: mentionCountSql,
            distinctPostCount: distinctPostCountSql,
          })
          .onConflictDoUpdate({
            target: topicCandidates.normalizedLabel,
            set: {
              mentionCount: mentionCountSql,
              distinctPostCount: distinctPostCountSql,
              sampleJson: candidate.sampleJson,
              lastSeenAt: now,
            },
          }),
      );
    }

    const representedTotal = item.comments.reduce(
      (sum, comment) => sum + comment.representedCount,
      0,
    );
    const latestObservation = latestObservationByKey.get(postKey);
    if (
      !latestObservation ||
      latestObservation.likeCount !== item.likeCount ||
      latestObservation.commentCount !== representedTotal ||
      latestObservation.shareCount !== item.shareCount
    )
      queries.push(
        db.insert(engagementObservations).values({
          entityType: "post",
          entityKey: postKey,
          likeCount: item.likeCount,
          commentCount: representedTotal,
          shareCount: item.shareCount,
          observedAt: now,
        }),
      );
  }

  const postCountSql = sql<number>`(select count(*) from ${posts})`;
  const commentCountSql = sql<number>`(
    select count(*) from ${comments} where ${comments.isCurrent} = 1
  )`;
  if (finalize)
    queries.push(
      db
        .update(snapshots)
        .set({ status: "archived" })
        .where(
          and(
            inArray(snapshots.status, ["active", "candidate", "failed"]),
            ne(snapshots.id, snapshotId),
          ),
        ),
      db
        .update(snapshots)
        .set({
          status: "active",
          postCount: postCountSql,
          commentCount: commentCountSql,
          publishedAt: now,
        })
        .where(eq(snapshots.id, snapshotId)),
    );
  else
    queries.push(
      db
        .update(snapshots)
        .set({ postCount: postCountSql, commentCount: commentCountSql })
        .where(eq(snapshots.id, snapshotId)),
    );
  queries.push(
    db
      .update(processingRuns)
      .set({
        status: "completed",
        processedCount: prepared.length,
        completedAt: now,
      })
      .where(eq(processingRuns.id, runId)),
    db.insert(syncLogs).values({ postCount: prepared.length }),
  );
  await executeAtomicD1Batch(db, queries);
}

function sentimentFromAspects(
  values: ReturnType<typeof extractAspects>,
): "positive" | "neutral" | "negative" {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const value of values) counts[value.sentiment] += 1;
  if (counts.positive > counts.negative && counts.positive > counts.neutral)
    return "positive";
  if (counts.negative > counts.positive && counts.negative > counts.neutral)
    return "negative";
  return "neutral";
}

export async function GET(request: Request) {
  try {
    requireSyncAuthorization(request);
    return Response.json({
      ok: true,
      protocol: SYNC_PROTOCOL,
      accepts: [...ACCEPTED_PROTOCOLS],
      maxBatchSize: MAX_POSTS_PER_BATCH,
      maxCommentsPerPost: 500,
      capabilities: [
        "platform-scoped-post-ids",
        "stable-comment-upsert",
        "content-version-history",
        "snapshot-publication",
        "topic-aspect-pipeline",
      ],
    });
  } catch (error) {
    if (error instanceof SyncRequestError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "同步协议探测失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let failedRunId = "";
  let failedSnapshotId = "";
  try {
    // Authentication happens before reading or parsing the potentially large body.
    requireSyncAuthorization(request);
    const body = await readSyncBody(request);
    const envelope: SyncEnvelope = Array.isArray(body) ? { posts: body } : body;
    const incoming = envelope.posts;
    if (
      !Array.isArray(incoming) ||
      incoming.length === 0 ||
      incoming.length > MAX_POSTS_PER_BATCH
    )
      throw new SyncRequestError(
        `每批需要包含 1–${MAX_POSTS_PER_BATCH} 篇帖子`,
      );
    if (incoming.some((item) => !item || typeof item !== "object"))
      throw new SyncRequestError("帖子格式不正确");

    // Validate and normalize the complete batch before the first database write.
    const prepared = await Promise.all(incoming.map(preparePost));
    assertStableBatchKeys(prepared);
    const now = new Date().toISOString();
    const safeSnapshotId =
      text(envelope.snapshot_id, 120) || `snapshot-${now.slice(0, 10)}`;
    const runId =
      text(envelope.batch_id, 120) ||
      `run-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
    const dataCutoffAt = text(envelope.data_cutoff_at, 64) || now;
    failedRunId = runId;
    failedSnapshotId = safeSnapshotId;
    const db = getDb();
    await persistPreparedBatch(db, prepared, {
      now,
      snapshotId: safeSnapshotId,
      runId,
      dataCutoffAt,
      finalize: envelope.finalize !== false,
    });

    invalidateSnapshotCache();
    return Response.json({
      ok: true,
      protocol: SYNC_PROTOCOL,
      snapshotId: safeSnapshotId,
      snapshotStatus: envelope.finalize === false ? "candidate" : "active",
      runId,
      received: incoming.length,
      upserted: prepared.length,
      validComments: prepared.reduce(
        (sum, item) => sum + item.comments.length,
        0,
      ),
      pipelineVersion: PIPELINE_VERSION,
      cleaningVersion: CLEANING_VERSION,
      topicVersion: TOPIC_VERSION,
    });
  } catch (error) {
    if (error instanceof SyncRequestError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("sync posts failed", {
      runId: failedRunId || undefined,
      snapshotId: failedSnapshotId || undefined,
      error,
    });
    return Response.json(
      {
        error: "同步失败，当前批次未发布，请稍后重试",
        runId: failedRunId || undefined,
      },
      { status: 500 },
    );
  }
}
