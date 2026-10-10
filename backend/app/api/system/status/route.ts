import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  aspects,
  comments,
  posts,
  processingRuns,
  snapshots,
  syncLogs,
  topicCandidates,
  topics,
} from "../../../../db/schema";
import { enforceRateLimit, errorResponse } from "../../../../lib/request";
import {
  CLEANING_VERSION,
  PIPELINE_VERSION,
  TOPIC_VERSION,
} from "../../../../lib/topic-pipeline";

const headers = {
  "Cache-Control": "public, max-age=15, stale-while-revalidate=30",
};

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "system-status", 60);
    const db = getDb();
    const [
      [activeSnapshot],
      [unpublishedSnapshot],
      [latestRun],
      [latestSync],
      [postTotal],
      [commentTotal],
      [topicTotal],
      [candidateTotal],
      [aspectTotal],
    ] = await Promise.all([
      db
        .select()
        .from(snapshots)
        .where(eq(snapshots.status, "active"))
        .orderBy(desc(snapshots.publishedAt), desc(snapshots.createdAt))
        .limit(1),
      db
        .select()
        .from(snapshots)
        .where(inArray(snapshots.status, ["candidate", "failed"]))
        .orderBy(desc(snapshots.createdAt))
        .limit(1),
      db
        .select()
        .from(processingRuns)
        .orderBy(desc(processingRuns.startedAt))
        .limit(1),
      db.select().from(syncLogs).orderBy(desc(syncLogs.id)).limit(1),
      db.select({ value: sql<number>`count(*)` }).from(posts),
      db
        .select({ value: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.isCurrent, true)),
      db
        .select({ value: sql<number>`count(*)` })
        .from(topics)
        .where(eq(topics.status, "active")),
      db
        .select({ value: sql<number>`count(*)` })
        .from(topicCandidates)
        .where(eq(topicCandidates.status, "collecting")),
      db.select({ value: sql<number>`count(*)` }).from(aspects),
    ]);

    const postCount = Number(postTotal?.value ?? 0);
    const commentCount = Number(commentTotal?.value ?? 0);
    const lineageState = activeSnapshot
      ? "versioned"
      : postCount
        ? "legacy-unversioned"
        : "empty";
    const status =
      unpublishedSnapshot?.status === "failed" || latestRun?.status === "failed"
        ? "degraded"
        : unpublishedSnapshot?.status === "candidate" ||
            latestRun?.status === "processing"
        ? "processing"
        : postCount
          ? "ready"
          : "empty";

    return Response.json(
      {
        status,
        checkedAt: new Date().toISOString(),
        data: {
          postCount,
          currentCommentCount: commentCount,
          lineageState,
          maxExplicitSelection: 200,
          maxGlobalSnapshot: 500,
          latestSyncAt: latestSync?.createdAt ?? null,
        },
        snapshot: activeSnapshot
          ? {
              id: activeSnapshot.id,
              status: activeSnapshot.status,
              dataCutoffAt: activeSnapshot.dataCutoffAt,
              publishedAt: activeSnapshot.publishedAt,
              postCount: activeSnapshot.postCount,
              commentCount: activeSnapshot.commentCount,
              pipelineVersion: activeSnapshot.pipelineVersion,
              cleaningVersion: activeSnapshot.cleaningVersion,
              topicVersion: activeSnapshot.topicVersion,
              indexVersion: activeSnapshot.indexVersion,
            }
          : null,
        pipeline: {
          version: PIPELINE_VERSION,
          cleaningVersion: CLEANING_VERSION,
          topicVersion: TOPIC_VERSION,
          stages: [
            "schema-validation",
            "deterministic-cleaning",
            "opinion-intent-separation",
            "multi-topic-aspect-extraction",
            "topic-level-sentiment",
            "candidate-topic-review",
            "snapshot-publication",
          ],
          latestRun: latestRun
            ? {
                id: latestRun.id,
                snapshotId: latestRun.snapshotId,
                status: latestRun.status,
                receivedCount: latestRun.receivedCount,
                processedCount: latestRun.processedCount,
                failedCount: latestRun.failedCount,
                startedAt: latestRun.startedAt,
                completedAt: latestRun.completedAt,
              }
            : null,
        },
        topicRegistry: {
          activeTopics: Number(topicTotal?.value ?? 0),
          collectingCandidates: Number(candidateTotal?.value ?? 0),
          assignedAspects: Number(aspectTotal?.value ?? 0),
          promotionPolicy:
            "高频候选先进入人工审核；通过后创建新 Topic 版本，不自动改写历史结论。",
        },
        rag: {
          orchestrator: "LangChain RunnableSequence",
          retriever: "hybrid lexical + metadata",
          generator: "deterministic grounded answer",
          llmConfigured: false,
          vectorStoreConfigured: false,
          evidenceUnit: "post/comment chunk",
          guardrail:
            "主情感统计只使用意见型评论；询问、事实、社交、跑题与混合意见单列。统计题读取确定性聚合；证据不足时拒答。",
        },
        limitations: [
          unpublishedSnapshot
            ? unpublishedSnapshot.status === "failed"
              ? "最近一次数据发布未完整完成；公开读取已暂停，等待同一快照安全重试。"
              : "新数据正在候选快照中处理；完成原子发布前，公开读取会短暂重试。"
            : null,
          lineageState === "legacy-unversioned"
            ? "现有历史数据尚未经过 v3 同步，因此没有可验证的快照血缘。"
            : null,
          "边缘节点限流和内存缓存属于 best-effort，不替代持久化网关限流。",
          "当前未接外部 LLM 与向量库；LangChain 负责编排和可追溯接口。",
        ].filter(Boolean),
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error, "系统状态暂不可用，请稍后重试");
  }
}
