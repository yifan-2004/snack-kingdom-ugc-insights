import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  aspects,
  comments,
  topicCandidates,
  topics,
} from "../../../db/schema";
import { enforceRateLimit, errorResponse } from "../../../lib/request";
import {
  assertPublicationFence,
  publicationFence,
} from "../../../lib/publication-fence";

const headers = {
  "Cache-Control": "public, max-age=20, stale-while-revalidate=40",
};

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "topics", 60);
    const fence = await publicationFence();
    const db = getDb();
    const [registry, candidates] = await Promise.all([
      db
        .select({
          id: topics.id,
          parentId: topics.parentId,
          name: topics.name,
          description: topics.description,
          origin: topics.origin,
          status: topics.status,
          version: topics.version,
          aspectCount: sql<number>`count(distinct ${comments.id})`,
          representedMentions: sql<number>`coalesce(sum(${comments.representedCount}), 0)`,
          positiveMentions: sql<number>`coalesce(sum(case when coalesce(json_extract(${comments.cleaningJson}, '$.opinionKind'), 'opinion') in ('opinion', 'mixed_opinion') and ${aspects.sentiment} = 'positive' then ${comments.representedCount} else 0 end), 0)`,
          neutralMentions: sql<number>`coalesce(sum(case when coalesce(json_extract(${comments.cleaningJson}, '$.opinionKind'), 'opinion') = 'opinion' and ${aspects.sentiment} = 'neutral' then ${comments.representedCount} else 0 end), 0)`,
          negativeMentions: sql<number>`coalesce(sum(case when coalesce(json_extract(${comments.cleaningJson}, '$.opinionKind'), 'opinion') in ('opinion', 'mixed_opinion') and ${aspects.sentiment} = 'negative' then ${comments.representedCount} else 0 end), 0)`,
          mixedOpinionMentions: sql<number>`coalesce(sum(case when json_extract(${comments.cleaningJson}, '$.opinionKind') = 'mixed_opinion' then ${comments.representedCount} else 0 end), 0)`,
          nonOpinionMentions: sql<number>`coalesce(sum(case when json_extract(${comments.cleaningJson}, '$.opinionKind') in ('inquiry', 'factual', 'social', 'off_topic') then ${comments.representedCount} else 0 end), 0)`,
        })
        .from(topics)
        .leftJoin(aspects, eq(aspects.topicId, topics.id))
        .leftJoin(
          comments,
          and(
            eq(aspects.commentId, comments.id),
            eq(comments.isCurrent, true),
          ),
        )
        .where(eq(topics.status, "active"))
        .groupBy(topics.id)
        .orderBy(topics.parentId, topics.name),
      db
        .select()
        .from(topicCandidates)
        .where(eq(topicCandidates.status, "collecting"))
        .orderBy(
          desc(topicCandidates.mentionCount),
          desc(topicCandidates.lastSeenAt),
        )
        .limit(50),
    ]);
    await assertPublicationFence(fence);
    return Response.json(
      {
        registry: registry.map((item) => ({
          ...item,
          aspectCount: Number(item.aspectCount),
          representedMentions: Number(item.representedMentions),
          sentiment: {
            positive: Number(item.positiveMentions),
            neutral: Number(item.neutralMentions),
            negative: Number(item.negativeMentions),
          },
          mixedOpinionMentions: Number(item.mixedOpinionMentions),
          nonOpinionMentions: Number(item.nonOpinionMentions),
          positiveMentions: undefined,
          neutralMentions: undefined,
          negativeMentions: undefined,
        })),
        candidates: candidates.map((item) => ({
          ...item,
          samples: safeSamples(item.sampleJson),
          sampleJson: undefined,
        })),
        governance: {
          automaticPromotion: false,
          reviewGate:
            "候选 Topic 需要达到样本量和跨帖子覆盖要求，再由 AI 给出合并/新增建议，最终由人工发布。",
          versionPolicy:
            "Topic 变更必须提升版本；已发布快照不自动改写历史统计口径。",
        },
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error, "Topic 注册表暂不可用，请稍后重试");
  }
}

function safeSamples(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}
