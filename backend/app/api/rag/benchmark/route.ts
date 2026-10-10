import { loadSnapshot } from "../../../../lib/intelligence";
import { runGroundedBenchmark } from "../../../../lib/langchain-rag";
import {
  enforceRateLimit,
  errorResponse,
  postIdsFrom,
  readJsonObject,
} from "../../../../lib/request";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "benchmark", 6);
    const body = await readJsonObject<{ postIds?: unknown }>(request);
    const rows = await loadSnapshot(postIdsFrom(body.postIds));
    if (!rows.length)
      return Response.json(
        { error: "当前范围没有可测试的帖子" },
        { status: 400 },
      );
    return Response.json(runGroundedBenchmark(rows));
  } catch (error) {
    return errorResponse(error, "评测暂不可用，请稍后重试");
  }
}
