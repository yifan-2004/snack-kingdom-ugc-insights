import { loadSnapshot } from "../../../../lib/intelligence";
import { enforceRateLimit, errorResponse } from "../../../../lib/request";

type Sentiment = "positive" | "neutral" | "negative";

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "sentiment-evaluation-sample", 12);
    const rows = await loadSnapshot();
    const groups: Record<Sentiment, Array<Record<string, unknown>>> = {
      positive: [],
      neutral: [],
      negative: [],
    };
    const excludedByKind: Record<string, number> = {};
    for (const post of rows) {
      for (const comment of post.comments) {
        if (comment.opinionKind !== "opinion") {
          excludedByKind[comment.opinionKind] =
            (excludedByKind[comment.opinionKind] ?? 0) +
            comment.representedCount;
          continue;
        }
        const predicted: Sentiment =
          comment.sentiment === "positive" || comment.sentiment === "negative"
            ? comment.sentiment
            : "neutral";
        groups[predicted].push({
          id: `comment-${comment.id}`,
          postId: post.id,
          postTitle: post.title,
          platform: post.platform,
          content: comment.content,
          predicted,
          representedCount: comment.representedCount,
        });
      }
    }
    const perClass = 20;
    const items = (Object.keys(groups) as Sentiment[]).flatMap((sentiment) =>
      groups[sentiment]
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))
        .slice(0, perClass),
    );
    return Response.json({
      version: "sentiment-manual-eval-v2-opinion-only",
      sampling:
        "deterministic stratified sample by predicted class among opinion-bearing comments",
      targetPerClass: perClass,
      sourcePostCount: rows.length,
      sourceCommentRecords: rows.reduce(
        (sum, post) => sum + post.comments.length,
        0,
      ),
      excludedByKind,
      items,
      limitations: [
        "样本只评测意见型评论的情感；询问、事实、社交、离题与褒贬混合信号从情感分母排除并单独统计。",
        "样本按系统预测类别分层，用于诊断而不是自然分布估计。",
        "gold 标签由人工选择，只保存在当前浏览器并可导出，不回写业务数据。",
      ],
    });
  } catch (error) {
    return errorResponse(error, "情感评测样本暂不可用");
  }
}
