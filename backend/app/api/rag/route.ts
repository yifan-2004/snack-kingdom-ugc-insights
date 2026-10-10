import { loadSnapshot } from "../../../lib/intelligence";
import { runGroundedRag } from "../../../lib/langchain-rag";
import { outputLocale } from "../../../lib/localized-analysis";
import {
  enforceRateLimit,
  errorResponse,
  postIdsFrom,
  PublicRequestError,
  readJsonObject,
} from "../../../lib/request";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "rag", 30);
    const body = await readJsonObject<{
      question?: unknown;
      postIds?: unknown;
      locale?: unknown;
    }>(request);
    const question = String(body.question ?? "").trim();
    if (question.length < 2 || question.length > 500)
      throw new PublicRequestError("问题需要包含 2–500 个字符");
    const rows = await loadSnapshot(postIdsFrom(body.postIds));
    if (!rows.length)
      return Response.json(
        { error: "当前范围没有可检索的帖子" },
        { status: 400 },
      );
    return Response.json(
      await runGroundedRag({
        rows,
        question,
        locale: outputLocale(body.locale),
        topK: 8,
      }),
    );
  } catch (error) {
    return errorResponse(error, "问答暂不可用，请稍后重试");
  }
}
